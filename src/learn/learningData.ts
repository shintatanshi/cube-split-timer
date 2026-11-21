import type {
  CubeFaceName,
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
import { createGeneratedOllPreview } from "./ollGeneratedPreview";

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
  f2l: "F2Lの基本41パターンを、形と手順を見ながら覚えます。",
  oll: "上面をそろえるOLLを、画像と3D再生で確認します。",
  pll: "最後の入れ替えPLLを、形ごとに見比べながら覚えます。",
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

const F2L_GENERATED_IMAGE_MODULES = import.meta.glob<string>(
  "../assets/learn/f2l-generated/*.{png,jpg,jpeg,webp,svg}",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

const F2L_GENERATED_IMAGE_URL_BY_FILE_NAME = new Map(
  Object.entries(F2L_GENERATED_IMAGE_MODULES).map(([path, imageUrl]) => [
    getFileName(path),
    imageUrl,
  ]),
);

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
  const generatedImageUrl =
    category === "f2l" ? F2L_GENERATED_IMAGE_URL_BY_FILE_NAME.get(fileName) : undefined;
  const algorithm = fileBaseNameToAlgorithm(baseName);
  const generatedOllPreview =
    category === "oll" ? createGeneratedOllPreview(algorithm) : null;
  const displayImageUrl = generatedOllPreview?.imageUrl ?? generatedImageUrl ?? imageUrl;
  const label = LEARNING_CATEGORY_LABELS[category];
  const highlightConfig =
    generatedOllPreview && category === "oll"
      ? {
        kind: "oll" as const,
        yellowPattern: generatedOllPreview.top,
        sidePattern: generatedOllPreview.side,
        focusFaces: ["U", "F", "R"] satisfies CubeFaceName[],
      }
      : applyF2lCaseOverride(createDefaultHighlightConfig(category), baseName);
  const moveCount = algorithm.split(/\s+/).filter(Boolean).length;
  const description =
    category === "f2l"
      ? "画像のペア位置を見て、手順を再生しながらF2Lの入れ方を覚えます。"
      : category === "oll"
        ? "上面の形を見て、黄色面をそろえる手順を確認します。"
        : "ピースの入れ替わり方を見て、最後のPLL手順を確認します。";

  return {
    id: makeCaseId(category, baseName),
    type: category,
    category,
    name: label,
    title: algorithm,
    subtitle: `${moveCount} moves`,
    algorithm,
    description,
    image: {
      kind: "asset",
      category,
      url: displayImageUrl,
      fileName,
      baseName,
      path,
    },
    imageUrl: displayImageUrl,
    highlightConfig,
    shape: repeatSticker("empty", 9),
    tags: generatedOllPreview
      ? [label, "自動生成図", `${moveCount} moves`]
      : generatedImageUrl
        ? [label, "仮生成画像", `${moveCount} moves`]
        : [label, `${moveCount} moves`],
  };
}

function getImageCasesByCategory(category: LearningCategory): LearningCase[] {
  return Object.entries(LEARN_IMAGE_MODULES[category])
    .sort(([pathA], [pathB]) => getFileName(pathA).localeCompare(getFileName(pathB)))
    .map(([path, imageUrl]) => createLearningCaseFromImage(category, path, imageUrl));
}

export const LEARNING_CASES: LearningCase[] = LEARNING_CATEGORIES.flatMap((category) =>
  category === "f2l"
    ? [
      ...APPROVED_F2L_CASES.filter((caseItem) => caseItem.caseType === "basic41").map(
        createApprovedF2lLearningCase,
      ),
      ...getImageCasesByCategory(category),
    ]
    : getImageCasesByCategory(category),
);

export function getLearningCasesByCategory(category: LearningCategory): LearningCase[] {
  return LEARNING_CASES.filter((item) => item.category === category);
}
