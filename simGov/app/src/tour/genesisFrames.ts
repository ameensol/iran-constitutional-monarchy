export interface GenesisFrame {
  stage: number;
  title: string;
  shahText: string;
  highlights: string[];
}

export const genesisFrames: GenesisFrame[] = [
  {
    stage: 0,
    title: 'An Empty Chain',
    shahText:
      'You are looking at an empty blockchain. No monarch, no parliament, no prime minister, no courts. Just a constitution, waiting to be filled with the institutions of governance. My father built dams and highways to bring Iran into the modern age. Today we build something he could only dream of: a government whose rules enforce themselves.',
    highlights: [],
  },
  {
    stage: 1,
    title: 'Coronation',
    shahText:
      'The first act of any constitutional monarchy is the coronation. A sovereign takes the oath, and the heirs are entered into the succession registry. In the old days, succession was decided by intrigue and bloodshed. Here, it is recorded immutably, visible to every citizen, and changeable only through the amendment process.',
    highlights: ['crown'],
  },
  {
    stage: 2,
    title: 'The First Elections',
    shahText:
      'Before anyone can sit in Parliament, the people must speak. Elections begin across all thirty-one provinces simultaneously. Four hundred and sixty-five provincial council members are elected first, because it is they who will select the senators. Then one hundred and forty-nine Majlis members are chosen by direct popular vote, one for every constituency from Tehran to Sistan-Baluchestan. Every ballot is sealed by a mathematical proof that reveals nothing about the voter. No parliament without elections. That is the rule, and the code enforces it.',
    highlights: ['elections'],
  },
  {
    stage: 3,
    title: 'The First Parliament',
    shahText:
      'The results are certified and the people\u2019s representatives take their seats. One hundred and forty-nine in the Majlis, elected directly by the people. Sixty-three senators chosen by the provincial councils and seven appointed by the Crown fill the upper house: seventy in all, with the Crown\u2019s share fixed at ten percent. Two chambers, two sources of legitimacy. This is the voice of the nation, and no law can pass without it.',
    highlights: ['parliament'],
  },
  {
    stage: 4,
    title: 'A Government Takes Shape',
    shahText:
      'The Crown nominates a candidate for prime minister, and the Majlis votes to confirm. The constitution does not require the nominee to come from any particular party, but a wise Crown will choose someone the Majlis can support. The PM designates a deputy and appoints ministers to form the cabinet. No one governs without Parliament\u2019s consent.',
    highlights: ['executive'],
  },
  {
    stage: 5,
    title: 'The Guardians of the Constitution',
    shahText:
      'The Crown nominates twelve justices to the Supreme Court, and the Senate confirms each one. They serve for nine years, shielded from political pressure, with a single mandate: ensure that every law, every action, every exercise of power conforms to the constitution. The Crown, the Prime Minister, or one-tenth of either chamber of Parliament can petition the court to strike down a law that violates the constitution.',
    highlights: ['court'],
  },
  {
    stage: 6,
    title: 'A Living Nation',
    shahText:
      'The first bill has been submitted to the Majlis: the Education Reform Act, waiting for debate. The machinery of democracy is running. Every institution you see on this dashboard is alive, populated, and governed by code that anyone can read.',
    highlights: ['bills'],
  },
  {
    stage: 7,
    title: 'Your Sandbox',
    shahText:
      'This is your country now. Dissolve the parliament. Trigger a constitutional crisis. Kill the monarch and watch the succession activate. File a no-confidence motion. Propose an amendment to the constitution itself. Nothing you do here is permanent, and everything you do teaches you how a constitutional monarchy works. The simulation will keep running from wherever you leave it.',
    highlights: [],
  },
];
