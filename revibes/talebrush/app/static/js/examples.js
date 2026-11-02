// Starting points taken from the paper, so a group can try TaleBrush quickly.

export const EXAMPLES = {
  mike: {
    label: "Mike, the jazz guitarist (Figure 1)",
    title: "",
    protagonist: "Mike",
    texts: [
      "Mike is a jazz guitarist who has great ambitions and devotion to music.",
      "Mike recently thought about expanding his expertise to heavy metal, thinking that mixing it with jazz would be interesting.",
    ],
    bullets: 8,
  },
  cinderella: {
    label: "Cinderella, fully written (Figure 8)",
    title: "Cinderella",
    protagonist: "Cinderella",
    texts: [
      "Cinderella lost her mother when she was young and her father got remarried.",
      "The stepmother and two stepsisters were not good people and mistreated making her do all the chores.",
      "One day, out of chance, Cinderella meets the Prince in the forest.",
      "She got an invitation to go to the royal ball ceremony.",
      "With the fairy godmother's help, she could go there in a fascinating dress and dance with the prince.",
      "However, all the things, the carriage, driver, horse, dress were all magic and they would disappear when the clock struck midnight.",
      "Cinderella hurried to leave the palace before it becomes midnight, but unfortunately, she lost her slippers.",
      "Prince eventually found her with the lost slippers, and Prince and Cinderella got married.",
      "They live happily ever after.",
    ],
    bullets: 9,
  },
  chris: {
    label: "Chris at the swimming pool (Figure 13)",
    title: "",
    protagonist: "Chris",
    texts: ["Chris likes to swim in the swimming pool during summer."],
    bullets: 8,
  },
  melissa: {
    label: "Melissa and the dragon (Introduction)",
    title: "",
    protagonist: "Melissa",
    texts: ["Melissa fought a dragon."],
    bullets: 6,
  },
  // Remix example. The paper's Discussion (Section 8) names this case as a limit of its model:
  // "in the story about Bob and Alice, it is hard to make Bob have a good fortune and Alice have
  // a bad one". The opening sentence is ours, not the paper's.
  bobAlice: {
    label: "Bob and Alice, two characters (remix; from the paper's Discussion)",
    title: "",
    characters: ["Bob", "Alice"],
    texts: ["Bob and Alice both auditioned for the lead role in their town's summer play."],
    bullets: 7,
  },
};
