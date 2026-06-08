import fs from "fs/promises";
import path from "path";

export type Project = {
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

const PROJECTS_ROOT = path.join(process.cwd(), "data", "projects");

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "proyecto";
}

function getProjectDir(slug: string): string {
  return path.join(PROJECTS_ROOT, slug);
}

function getConversationsPath(slug: string): string {
  return path.join(getProjectDir(slug), "conversations.json");
}

export function isValidProjectSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function normalizeConversations(data: unknown): ConversationMessage[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const flat =
    data.length === 1 && Array.isArray(data[0])
      ? (data[0] as unknown[])
      : data;

  return flat
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && "role" in item && "content" in item,
    )
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content),
      timestamp:
        typeof item.timestamp === "string"
          ? item.timestamp
          : new Date(0).toISOString(),
    }));
}

async function projectExists(slug: string): Promise<boolean> {
  try {
    await fs.access(getProjectDir(slug));
    return true;
  } catch {
    return false;
  }
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 2;

  while (await projectExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

async function readProject(slug: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(
      path.join(getProjectDir(slug), "project.json"),
      "utf-8",
    );
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<Project[]> {
  try {
    const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readProject(entry.name)),
    );

    return projects
      .filter((project): project is Project => project !== null)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  } catch {
    return [];
  }
}

export async function createProject(name: string): Promise<Project> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Project name is required");
  }

  await fs.mkdir(PROJECTS_ROOT, { recursive: true });

  const slug = await ensureUniqueSlug(slugify(trimmedName));
  const now = new Date().toISOString();
  const project: Project = {
    name: trimmedName,
    slug,
    createdAt: now,
    updatedAt: now,
  };

  const projectDir = getProjectDir(slug);
  await fs.mkdir(path.join(projectDir, "documents"), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "project.json"),
    JSON.stringify(project, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(projectDir, "memory.json"),
    JSON.stringify([], null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(projectDir, "conversations.json"),
    JSON.stringify([], null, 2),
    "utf-8",
  );

  return project;
}

export async function getConversations(
  slug: string,
): Promise<ConversationMessage[]> {
  if (!isValidProjectSlug(slug) || !(await projectExists(slug))) {
    throw new Error("Project not found");
  }

  try {
    const raw = await fs.readFile(getConversationsPath(slug), "utf-8");
    return normalizeConversations(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function appendConversationMessage(
  slug: string,
  message: Pick<ConversationMessage, "role" | "content">,
): Promise<ConversationMessage> {
  if (!isValidProjectSlug(slug)) {
    throw new Error("Invalid project slug");
  }

  const project = await readProject(slug);
  if (!project) {
    throw new Error("Project not found");
  }

  const conversations = await getConversations(slug);
  const entry: ConversationMessage = {
    role: message.role,
    content: message.content,
    timestamp: new Date().toISOString(),
  };

  conversations.push(entry);
  await fs.writeFile(
    getConversationsPath(slug),
    JSON.stringify(conversations, null, 2),
    "utf-8",
  );

  const updatedProject: Project = {
    ...project,
    updatedAt: entry.timestamp,
  };
  await fs.writeFile(
    path.join(getProjectDir(slug), "project.json"),
    JSON.stringify(updatedProject, null, 2),
    "utf-8",
  );

  return entry;
}
