import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

// Token endpoint for direct-to-Blob client uploads (bypasses the 4.5MB
// serverless body limit — important for videos). The Asset DB row is created
// by the client via POST /api/assets after the upload succeeds, because the
// onUploadCompleted webhook can't reach localhost in dev.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/jpeg", "image/png", "image/webp", "image/gif",
          "video/mp4", "video/webm", "video/quicktime",
        ],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId }),
      }),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
