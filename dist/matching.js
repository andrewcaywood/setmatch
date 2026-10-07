export const demoProject = {
  id: "afterimage",
  title: "Afterimage",
  filmmaker: "Andrew",
  format: "Student short film",
  logline: "A student's shadow falls further behind him until it begins acting on its own.",
  role: "The Student",
  roleDescription: "A quiet lead in a psychological horror film. The performance begins with ordinary school-day behavior and gradually shifts toward unease as the character notices his shadow behaving independently. Expressive reactions and subtle, camera-friendly acting matter more than dialogue.",
  tone: "Atmospheric, restrained, unsettling",
  genres: ["Horror", "Drama"],
  skills: ["Screen acting", "Physical acting"],
  schedule: "After school",
  commitment: "Two rehearsals and one weekend shoot",
  notes: "The film uses a delayed-shadow visual effect. No dangerous stunts or practical effects are required."
};

export const demoActors = [
  {
    id: "maya", name: "Maya Chen", initials: "MC", color: "lavender", year: "Acting II",
    bio: "I like understated performances where a character's reaction tells the story. I have worked on two suspense shorts and enjoy finding the moment when an ordinary scene becomes strange.",
    genres: ["Horror", "Drama", "Mystery"], skills: ["Screen acting", "Physical acting", "Improvisation"],
    availability: ["After school", "Weekends"], portfolio: "Two student shorts · stage ensemble"
  },
  {
    id: "eli", name: "Eli Navarro", initials: "EN", color: "peach", year: "Acting III",
    bio: "I enjoy naturalistic film acting and characters who keep fear to themselves. I am comfortable with long silent takes and expressive movement.",
    genres: ["Drama", "Thriller", "Horror"], skills: ["Screen acting", "Physical acting"],
    availability: ["After school"], portfolio: "Three short films · one-act play"
  },
  {
    id: "samira", name: "Samira Brooks", initials: "SB", color: "mint", year: "Acting II",
    bio: "Character-driven stories are my favorite. I like subtle emotional arcs and can rehearse after classes. My recent work has been in contemporary drama.",
    genres: ["Drama", "Comedy"], skills: ["Screen acting", "Voice acting"],
    availability: ["After school", "Weekends"], portfolio: "Drama workshop · student film"
  },
  {
    id: "jordan", name: "Jordan Price", initials: "JP", color: "butter", year: "Acting I",
    bio: "I love fast-paced comedy, improv, and big ensemble scenes. I am looking for my first on-camera role and enjoy collaborative rehearsals.",
    genres: ["Comedy", "Adventure"], skills: ["Improvisation", "Stage acting"],
    availability: ["Weekends"], portfolio: "Improv showcase · school play"
  },
  {
    id: "theo", name: "Theo Martinez", initials: "TM", color: "blue", year: "Acting III",
    bio: "I like physical storytelling and eerie stories with very little dialogue. I have played creatures and shadow-like characters in theater.",
    genres: ["Horror", "Fantasy"], skills: ["Physical acting", "Stage acting"],
    availability: ["After school", "Weekends"], portfolio: "Movement ensemble · two plays"
  },
  {
    id: "riley", name: "Riley Shah", initials: "RS", color: "rose", year: "Acting II",
    bio: "I enjoy expressive dialogue, romantic comedy, and bright, energetic characters. Most of my experience is on stage.",
    genres: ["Comedy", "Romance"], skills: ["Stage acting", "Improvisation"],
    availability: ["After school"], portfolio: "Musical ensemble · comedy scene"
  }
];

export const genreChoices = ["Horror", "Drama", "Mystery", "Thriller", "Comedy", "Adventure", "Fantasy", "Romance", "Documentary"];
export const skillChoices = ["Screen acting", "Physical acting", "Stage acting", "Improvisation", "Voice acting", "Dance"];
export const scheduleChoices = ["After school", "Weekends", "Mornings"];

const stopWords = new Set("a an and are as at be by can for from has have in into is it its of on or our that the their them these this to was with you your where who would more than very".split(" "));

function tokens(text) {
  return (text.toLowerCase().match(/[a-z]{3,}/g) || []).filter(word => !stopWords.has(word));
}

export function projectText(project) {
  return [project.title, project.logline, project.role, project.roleDescription, project.tone, project.genres.join(" "), project.skills.join(" ")].join(". ");
}

export function actorText(actor) {
  return [actor.bio, actor.genres.join(" "), actor.skills.join(" "), actor.portfolio].join(". ");
}

function cosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

function tfidfSimilarity(documents) {
  const lists = documents.map(tokens);
  const documentCounts = new Map();
  for (const list of lists) for (const word of new Set(list)) documentCounts.set(word, (documentCounts.get(word) || 0) + 1);
  const vocabulary = [...documentCounts.keys()];
  const vectors = lists.map(list => {
    const counts = new Map();
    for (const word of list) counts.set(word, (counts.get(word) || 0) + 1);
    return vocabulary.map(word => (counts.get(word) || 0) * (Math.log((documents.length + 1) / ((documentCounts.get(word) || 0) + 1)) + 1));
  });
  return vectors.slice(1).map(vector => cosine(vectors[0], vector));
}

let extractorPromise;

export async function semanticSimilarities(project, actors) {
  if (!extractorPromise) {
    extractorPromise = import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1")
      .then(async ({ pipeline, env }) => {
        env.allowLocalModels = false;
        return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
      });
  }
  const extractor = await extractorPromise;
  const output = await extractor([projectText(project), ...actors.map(actorText)], { pooling: "mean", normalize: true });
  const vectors = output.tolist();
  return vectors.slice(1).map(vector => cosine(vectors[0], vector));
}

export function localSimilarities(project, actors) {
  return tfidfSimilarity([projectText(project), ...actors.map(actorText)]);
}

export function rankActors(project, actors, similarities, engine = "local") {
  return actors.map((actor, index) => {
    const sharedGenres = project.genres.filter(genre => actor.genres.includes(genre));
    const sharedSkills = project.skills.filter(skill => actor.skills.includes(skill));
    const available = actor.availability.includes(project.schedule);
    const semantic = Math.max(0, similarities[index] || 0);
    const semanticFit = engine === "semantic" ? Math.min(1, semantic / 0.72) : Math.min(1, semantic / 0.48);
    const genreFit = project.genres.length ? sharedGenres.length / project.genres.length : 0;
    const skillFit = project.skills.length ? sharedSkills.length / project.skills.length : 0;
    const score = Math.round(100 * (semanticFit * 0.7 + genreFit * 0.15 + skillFit * 0.15));
    const reasons = [];
    if (sharedGenres.length) reasons.push(`${sharedGenres.join(" and ")} interest`);
    if (sharedSkills.length) reasons.push(`${sharedSkills.join(" and ")} experience`);
    reasons.push(available ? `Available ${project.schedule.toLowerCase()}` : `Unavailable ${project.schedule.toLowerCase()}`);
    return { ...actor, score, reasons, available, sharedGenres, sharedSkills, semantic };
  }).sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score);
}

export function recommend(project, actors, engine = "local", similarities = null) {
  return rankActors(project, actors, similarities || localSimilarities(project, actors), engine);
}
