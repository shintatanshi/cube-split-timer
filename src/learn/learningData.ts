import type {
  F2lHighlightConfig,
  LearningCase,
  LearningCategory,
  LearningHighlightConfig,
  LearningSticker,
} from "../types";

type ImageModuleMap = Record<string, string>;

export const LEARNING_CATEGORIES: LearningCategory[] = ["f2l", "oll", "pll"];

export const LEARNING_CATEGORY_LABELS: Record<LearningCategory, string> = {
  f2l: "F2L",
  oll: "OLL",
  pll: "PLL",
};

export const LEARNING_CATEGORY_DESCRIPTIONS: Record<LearningCategory, string> = {
  f2l: "src/assets/learn/f2l に入れた画像から自動でケースを読み込みます。",
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
    slot: "right",
    centers: ["U", "F", "R"],
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

function createLearningCaseFromImage(
  category: LearningCategory,
  path: string,
  imageUrl: string,
): LearningCase {
  const fileName = getFileName(path);
  const baseName = removeExtension(fileName);
  const algorithm = fileBaseNameToAlgorithm(baseName);
  const label = LEARNING_CATEGORY_LABELS[category];

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
    highlightConfig: createDefaultHighlightConfig(category),
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
  getImageCasesByCategory(category),
);

export function getLearningCasesByCategory(category: LearningCategory): LearningCase[] {
  return LEARNING_CASES.filter((item) => item.category === category);
}
