import type {
  F2lCase,
  F2lCaseImage,
  F2lHighlightConfig,
  F2lTargetSlot,
  LearningCase,
  LearningCategory,
  LearningHighlightConfig,
  LearningSticker,
} from "../types";
import { APPROVED_F2L_CASES } from "./f2lCaseData";

type ImageModuleMap = Record<string, string>;

interface F2lCaseOverride {
  targetSlot?: F2lTargetSlot;
  highlightMode?: F2lHighlightConfig["highlightMode"];
  manualHighlight?: F2lHighlightConfig["manualHighlight"];
}

export const LEARNING_CATEGORIES: LearningCategory[] = ["f2l", "oll", "pll"];

export const LEARNING_CATEGORY_LABELS: Record<LearningCategory, string> = {
  f2l: "F2L",
  oll: "OLL",
  pll: "PLL",
};

export const LEARNING_CATEGORY_DESCRIPTIONS: Record<LearningCategory, string> = {
  f2l: "src/assets/learn/f2l の画像ケースと、承認済みの追加F2Lデータを表示します。",
  oll: "src/assets/learn/oll に入れた画像から自動でケースを読み込みます。",
  pll: "src/assets/learn/pll に入れた画像から自動でケースを読み込みます。",
};

export const LEARNING_ASSET_FOLDERS: Record<LearningCategory, string> = {
  f2l: "src/assets/learn/f2l",
  oll: "src/assets/learn/oll",
  pll: "src/assets/learn/pll",
};

const LEARN_IMAGE_MODULES = {
  f2l: import.meta.glob<string>("../assets/learn/f2l/*.{png,jpg,jpeg,webp,svg}", {
    eager: true,
    import: "default",
    query: "?url",
  }),
  oll: import.meta.glob<string>("../assets/learn/oll/*.{png,jpg,jpeg,webp,svg}", {
    eager: true,
    import: "default",
    query: "?url",
  }),
  pll: import.meta.glob<string>("../assets/learn/pll/*.{png,jpg,jpeg,webp,svg}", {
    eager: true,
    import: "default",
    query: "?url",
  }),
} satisfies Record<LearningCategory, ImageModuleMap>;

const F2L_CASE_OVERRIDES: Record<string, F2lCaseOverride> = {
  // Example:
  // R_U_Rp: { targetSlot: "FR" },
  // Lp_Up_L: { targetSlot: "FL" },
  // Custom manual cubie IDs use solved-position IDs:
  // Some_Special_Case: {
  //   highlightMode: "manual",
  //   manualHighlight: { corner: "corner:1,-1,1", edge: "edge:1,0,1" },
  // },
};

function repeatSticker(sticker: LearningSticker, count: number): LearningSticker[] {
  return Array.from({ length: count }, () => sticker);
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getFileName(path: string): string {
  return decodePathPart(path.split("/").at(-1) ?? path);
}

function removeExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function fileBaseNameToAlgorithm(baseName: string): string {
  return baseName
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean)
    .map(fileTokenToMove)
    .join(" ");
}

function fileTokenToMove(token: string): string {
  const primeWideBeforeW = token.match(/^([URFDLB])p(w)$/);

  if (primeWideBeforeW) {
    return `${primeWideBeforeW[1]}w'`;
  }

  if (token.endsWith("p2")) {
    return `${token.slice(0, -2)}2`;
  }

  if (token.endsWith("2p")) {
    return token.slice(0, -1);
  }

  if (token.endsWith("p")) {
    return `${token.slice(0, -1)}'`;
  }

  return token;
}

function makeCaseId(category: LearningCategory, baseName: string): string {
  const safeBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `asset-${category}-${safeBaseName || "case"}`;
}

function createDefaultF2lHighlight(): F2lHighlightConfig {
  return {
    kind: "f2l",
    startCorner: "topRight",
    startEdge: "right",
    targetCorner: [1, -1, 1],
    targetEdge: [1, 0, 1],
    targetSlot: "auto",
    highlightMode: "auto",
    slot: "right",
    centers: ["U", "F", "R"],
  };
}

const F2L_OFFICIAL_SLOT_CONFIG: Record<
  Exclude<F2lTargetSlot, "auto">,
  {
    slot: F2lCaseImage["slot"];
    targetCorner: [number, number, number];
    targetEdge: [number, number, number];
    centers: F2lHighlightConfig["centers"];
  }
> = {
  FR: { slot: "right", targetCorner: [1, -1, 1], targetEdge: [1, 0, 1], centers: ["D", "F", "R"] },
  FL: { slot: "left", targetCorner: [-1, -1, 1], targetEdge: [-1, 0, 1], centers: ["D", "F", "L"] },
  BR: { slot: "back", targetCorner: [1, -1, -1], targetEdge: [1, 0, -1], centers: ["D", "B", "R"] },
  BL: { slot: "wrong", targetCorner: [-1, -1, -1], targetEdge: [-1, 0, -1], centers: ["D", "B", "L"] },
};

const F2L_CASE_TYPE_LABELS: Record<F2lCase["caseType"], string> = {
  basic41: "基本41",
  advanced: "追加F2L",
  backSlot: "裏F2L",
  insertVariation: "インサート",
  extraction: "取り出し",
  rotationless: "回転削減",
  other: "その他",
};

function getOfficialF2lSlotConfig(caseItem: F2lCase) {
  return caseItem.targetSlot === "auto"
    ? F2L_OFFICIAL_SLOT_CONFIG.FR
    : F2L_OFFICIAL_SLOT_CONFIG[caseItem.targetSlot];
}

function createApprovedF2lLearningCase(caseItem: F2lCase): LearningCase {
  const slotConfig = getOfficialF2lSlotConfig(caseItem);
  const caseTypeLabel = F2L_CASE_TYPE_LABELS[caseItem.caseType];
  const id = caseItem.learnCaseId ?? `official-${caseItem.id}`;

  return {
    id,
    type: "f2l",
    category: "f2l",
    name: caseItem.name,
    title: caseItem.name,
    subtitle: `${caseTypeLabel} / ${caseItem.targetSlot} / ${caseItem.moveCount} moves`,
    algorithm: caseItem.alg,
    alternative: caseItem.inverseAlg,
    description: caseItem.description,
    image: {
      kind: "f2l",
      slot: slotConfig.slot,
      relation: caseItem.caseType === "backSlot" ? "backSlot" : "paired",
      corner: "topRight",
      edge: "top",
    },
    imageUrl: "",
    highlightConfig: {
      kind: "f2l",
      startCorner: "topRight",
      startEdge: "top",
      targetCorner: slotConfig.targetCorner,
      targetEdge: slotConfig.targetEdge,
      targetSlot: caseItem.targetSlot,
      highlightMode: "auto",
      slot: slotConfig.slot,
      centers: slotConfig.centers,
    },
    shape: repeatSticker("empty", 9),
    tags: ["正式F2L", caseTypeLabel, caseItem.difficulty, ...caseItem.tags],
  };
}

function createDefaultHighlightConfig(category: LearningCategory): LearningHighlightConfig {
  if (category === "f2l") {
    return createDefaultF2lHighlight();
  }

  if (category === "oll") {
    return {
      kind: "oll",
      yellowPattern: repeatSticker("primary", 9),
      sidePattern: repeatSticker("muted", 12),
      focusFaces: ["U", "F", "R"],
    };
  }

  return {
    kind: "pll",
    arrows: [],
    blocks: [],
    focusFaces: ["U", "F", "R", "L"],
  };
}

function applyF2lCaseOverride(
  config: LearningHighlightConfig,
  baseName: string,
): LearningHighlightConfig {
  if (config.kind !== "f2l") {
    return config;
  }

  const override = F2L_CASE_OVERRIDES[baseName];

  if (!override) {
    return config;
  }

  return {
    ...config,
    targetSlot: override.targetSlot ?? config.targetSlot,
    highlightMode: override.highlightMode ?? config.highlightMode,
    manualHighlight: override.manualHighlight ?? config.manualHighlight,
  };
}

function createLearningCaseFromImage(
  category: LearningCategory,
  path: string,
  imageUrl: string,
): LearningCase {
  const fileName = getFileName(path);
  const baseName = removeExtension(fileName);
  const algorithm = fileBaseNameToAlgorithm(baseName);
  const label = LEARNING_CATEGORY_LABELS[category];
  const highlightConfig = applyF2lCaseOverride(createDefaultHighlightConfig(category), baseName);

  return {
    id: makeCaseId(category, baseName),
    type: category,
    category,
    name: `${label}: ${algorithm}`,
    title: `${label}: ${algorithm}`,
    subtitle: fileName,
    algorithm,
    description: `${LEARNING_ASSET_FOLDERS[category]} から自動読み込みしたケースです。`,
    image: {
      kind: "asset",
      category,
      url: imageUrl,
      fileName,
      baseName,
      path,
    },
    imageUrl,
    highlightConfig,
    shape: repeatSticker("empty", 9),
    tags: [label],
  };
}

function getImageCasesByCategory(category: LearningCategory): LearningCase[] {
  return Object.entries(LEARN_IMAGE_MODULES[category])
    .sort(([pathA], [pathB]) => getFileName(pathA).localeCompare(getFileName(pathB)))
    .map(([path, imageUrl]) => createLearningCaseFromImage(category, path, imageUrl));
}

export const LEARNING_CASES: LearningCase[] = LEARNING_CATEGORIES.flatMap((category) =>
  category === "f2l"
    ? [...APPROVED_F2L_CASES.map(createApprovedF2lLearningCase), ...getImageCasesByCategory(category)]
    : getImageCasesByCategory(category),
);

export function getLearningCasesByCategory(category: LearningCategory): LearningCase[] {
  return LEARNING_CASES.filter((item) => item.category === category);
}
