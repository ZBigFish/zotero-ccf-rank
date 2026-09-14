/**
 * The "绝对权威" journals: CNS (Cell / Nature / Science) and their major
 * sub-journals.
 *
 * These are not in the CCF catalog and are not all in the 中科院 list that ships
 * with the plugin, so a Nature paper used to render as "中科院1区 无分区" — the
 * "无分区" part being actively misleading. This catalog gives them their own
 * attribute instead.
 *
 * Scope is deliberately narrow: the three main journals plus the sub-journals a
 * computer scientist would actually cite. The long tail (Scientific Reports,
 * PLOS ONE, Nature Precedings, …) is *not* here, because calling those "权威"
 * would make the attribute worthless. `nature:communications` is the lowest tier
 * included and matches the request; add more with `top: true` in
 * `tools/out/top-journals.json` if needed.
 *
 * `abbr` is the abbreviation used in the summary line (Nature Portfolio's own
 * short name, e.g. "NC" for Nature Communications).
 */

export type TopJournalFamily = "nature" | "science" | "cell";

export interface TopJournal {
  /** Family the journal belongs to. */
  family: TopJournalFamily;
  /** Display name of the family, e.g. "Nature". */
  familyLabel: string;
  /** "main" for Cell/Nature/Science themselves, "sub" for the sub-journals. */
  kind: "main" | "sub";
  /** Name as it appears in metadata. */
  name: string;
  /** Abbreviation shown in the summary line. */
  abbr: string;
  /** ISSNs (normalized, no dash) that identify the journal. */
  issn?: string[];
  /** Extra spellings that appear in publisher metadata. */
  aliases?: string[];
}

/** Normalized ISSN (digits only, or with a trailing X). */
export function normalizeIssnKey(value: string | undefined): string {
  return String(value ?? "")
    .replace(/[^0-9xX]/g, "")
    .toUpperCase();
}

/** Lowercase, punctuation-free key for name comparison. */
export function nameKey(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const TOP_JOURNALS: TopJournal[] = [
  // ------------------------------------------------------------------ Nature
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "main",
    name: "Nature",
    abbr: "Nature",
    issn: ["00280836", "14764687"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Communications",
    abbr: "NC",
    issn: ["20411723"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Machine Intelligence",
    abbr: "NMI",
    issn: ["25225891"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Neuroscience",
    abbr: "NN",
    issn: ["10976256", "15461726"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Methods",
    abbr: "NM",
    issn: ["15487091", "15487105"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Biotechnology",
    abbr: "NBT",
    issn: ["10870156", "15461696"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Medicine",
    abbr: "NatMed",
    issn: ["10788956", "1546170x"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Genetics",
    abbr: "NG",
    issn: ["10614036", "15461718"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Physics",
    abbr: "NPhys",
    issn: ["17452481", "17452473"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Chemistry",
    abbr: "NChem",
    issn: ["17554330", "17554349"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Materials",
    abbr: "NMat",
    issn: ["14761122", "14764660"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Photonics",
    abbr: "NPhoton",
    issn: ["17494885", "17494893"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Electronics",
    abbr: "NElectron",
    issn: ["25201131"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Energy",
    abbr: "NEnergy",
    issn: ["20587546"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Sustainability",
    abbr: "NSustain",
    issn: ["23989629"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Human Behaviour",
    abbr: "NHB",
    issn: ["23973374"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Biomedical Engineering",
    abbr: "NBME",
    issn: ["2157846x"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Structural & Molecular Biology",
    abbr: "NSMB",
    issn: ["15459993", "15459985"],
    aliases: ["Nature Structural and Molecular Biology"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Cell Biology",
    abbr: "NCB",
    issn: ["14657392", "14764679"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Immunology",
    abbr: "NI",
    issn: ["15292908", "15292916"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Microbiology",
    abbr: "NatMicrobiol",
    issn: ["20585276"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Materials",
    abbr: "NRM",
    issn: ["20588437"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Physics",
    abbr: "NRP",
    issn: ["25225820"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Cancer",
    abbr: "NRC",
    issn: ["1474175x", "14741768"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Drug Discovery",
    abbr: "NRDD",
    issn: ["14741776", "14741784"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Molecular Cell Biology",
    abbr: "NRMCB",
    issn: ["14710072", "14710080"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Genetics",
    abbr: "NRG",
    issn: ["14710056", "14710064"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Immunology",
    abbr: "NRI",
    issn: ["14741733", "14741741"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Neuroscience",
    abbr: "NRN",
    issn: ["1471003x", "14710048"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Clinical Oncology",
    abbr: "NRCO",
    issn: ["17594758", "17594766"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Bioengineering",
    abbr: "NRB",
    issn: ["27318874"],
  },
  {
    family: "nature",
    familyLabel: "Nature",
    kind: "sub",
    name: "Nature Reviews Electrical Engineering",
    abbr: "NREE",
    issn: ["29481968"],
  },

  // ----------------------------------------------------------------- Science
  {
    family: "science",
    familyLabel: "Science",
    kind: "main",
    name: "Science",
    abbr: "Science",
    issn: ["00368075", "10959203"],
  },
  {
    family: "science",
    familyLabel: "Science",
    kind: "sub",
    name: "Science Advances",
    abbr: "SciAdv",
    issn: ["23752548"],
  },
  {
    family: "science",
    familyLabel: "Science",
    kind: "sub",
    name: "Science Robotics",
    abbr: "SciRobot",
    issn: ["24709476"],
  },
  {
    family: "science",
    familyLabel: "Science",
    kind: "sub",
    name: "Science Translational Medicine",
    abbr: "SciTranslMed",
    issn: ["19466234", "19466242"],
  },
  {
    family: "science",
    familyLabel: "Science",
    kind: "sub",
    name: "Science Immunology",
    abbr: "SciImmunol",
    issn: ["24709468"],
  },
  {
    family: "science",
    familyLabel: "Science",
    kind: "sub",
    name: "Science Signaling",
    abbr: "SciSignal",
    issn: ["19450877", "19379145"],
  },

  // -------------------------------------------------------------------- Cell
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "main",
    name: "Cell",
    abbr: "Cell",
    issn: ["00928674", "10974172"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Reports",
    abbr: "CellRep",
    issn: ["22111247"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Systems",
    abbr: "CellSys",
    issn: ["24054712"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Stem Cell",
    abbr: "CSC",
    issn: ["19345909", "18759777"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Metabolism",
    abbr: "CellMetab",
    issn: ["15504131", "19327420"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Host & Microbe",
    abbr: "CHM",
    issn: ["19313128", "19346010"],
    aliases: ["Cell Host and Microbe"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cell Chemical Biology",
    abbr: "CCB",
    issn: ["24519456", "24519448"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Molecular Cell",
    abbr: "MolCell",
    issn: ["10972765", "10974164"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Developmental Cell",
    abbr: "DevCell",
    issn: ["15345807", "18781551"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Cancer Cell",
    abbr: "CancerCell",
    issn: ["15356108", "18783686"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Immunity",
    abbr: "Immunity",
    issn: ["10747613", "10974180"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Neuron",
    abbr: "Neuron",
    issn: ["08966273", "10974199"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Current Biology",
    abbr: "CurrBiol",
    issn: ["09609822", "18790445"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Cognitive Sciences",
    abbr: "TiCS",
    issn: ["13646613", "1879307x"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Neurosciences",
    abbr: "TiNS",
    issn: ["01662236", "1878108x"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Genetics",
    abbr: "TiG",
    issn: ["01689525", "13624555"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Biotechnology",
    abbr: "TiB",
    issn: ["01677799", "18793096"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Molecular Medicine",
    abbr: "TiMM",
    issn: ["14714914", "1471499x"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Cell Biology",
    abbr: "TiCB",
    issn: ["09628924", "18792561"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Immunology",
    abbr: "TiI",
    issn: ["14714906", "14714913"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Microbiology",
    abbr: "TiM",
    issn: ["0966842x", "18784340"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Ecology & Evolution",
    abbr: "TREE",
    issn: ["01695347", "18728359"],
    aliases: ["Trends in Ecology and Evolution"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Pharmacological Sciences",
    abbr: "TiPS",
    issn: ["01656147", "18733735"],
  },
  {
    family: "cell",
    familyLabel: "Cell",
    kind: "sub",
    name: "Trends in Plant Science",
    abbr: "TiPS-Plant",
    issn: ["13601385", "18784348"],
  },
];

const BY_ISSN = new Map<string, TopJournal>();
const BY_NAME = new Map<string, TopJournal>();
for (const journal of TOP_JOURNALS) {
  for (const issn of journal.issn ?? []) {
    BY_ISSN.set(normalizeIssnKey(issn), journal);
  }
  for (const name of [journal.name, ...(journal.aliases ?? [])]) {
    BY_NAME.set(nameKey(name), journal);
  }
}

/** Find a top journal by ISSN. */
export function topJournalByIssn(
  issn: string | undefined,
): TopJournal | undefined {
  const key = normalizeIssnKey(issn);
  if (key.length !== 8) return undefined;
  return BY_ISSN.get(key);
}

/**
 * Find a top journal by name.
 *
 * Matching is exact on a normalized key. A fuzzy match is deliberately avoided:
 * "Nature" must not swallow "Nature Precedings", and "Science" must not swallow
 * "Science of the Total Environment" — both of which a prefix match would do.
 */
export function topJournalByName(
  name: string | undefined,
): TopJournal | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return BY_NAME.get(key);
}

/** Whether the journal is one of the three main journals. */
export function isTopMainJournal(journal: TopJournal | undefined): boolean {
  return journal?.kind === "main";
}

/**
 * Encode a match for the `TOP-JOURNAL` Extra line: `family:kind:abbr:name`.
 *
 * One line keeps `Extra` readable and makes the value searchable in Zotero
 * (`TOP-JOURNAL: nature`).
 */
export function encodeTopJournal(journal: TopJournal): string {
  return [journal.family, journal.kind, journal.abbr, journal.name].join(":");
}

/** Decode the `TOP-JOURNAL` Extra line. */
export function decodeTopJournal(
  value: string | undefined,
): TopJournal | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const [family, kind, abbr, ...rest] = text.split(":");
  if (!family || !kind || !abbr) return undefined;
  const known = TOP_JOURNALS.find(
    (journal) => journal.family === family && journal.abbr === abbr,
  );
  if (known) return known;
  // Tolerate a hand-edited line whose name no longer matches the catalog.
  return {
    family: family as TopJournalFamily,
    familyLabel: family.charAt(0).toUpperCase() + family.slice(1),
    kind: kind === "main" ? "main" : "sub",
    abbr,
    name: rest.join(":") || abbr,
  };
}
