import {
  appendConversationMessage,
  getConversations,
  isValidProjectSlug,
} from "@/lib/projects";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    if (!isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "Invalid project slug" }, { status: 400 });
    }

    const messages = await getConversations(slug);
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("GET /api/projects/[slug]/conversations error:", error);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    if (!isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "Invalid project slug" }, { status: 400 });
    }

    let body: { role?: unknown; content?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { role, content } = body;
    if (role !== "user" && role !== "assistant") {
      return NextResponse.json(
        { error: "role must be 'user' or 'assistant'" },
        { status: 400 },
      );
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const message = await appendConversationMessage(slug, {
      role,
      content: content.trim(),
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("POST /api/projects/[slug]/conversations error:", error);
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 },
    );
  }
}
