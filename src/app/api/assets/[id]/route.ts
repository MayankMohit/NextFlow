import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/assets/[id] — remove the DB row and the Blob file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (asset.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.asset.delete({ where: { id } });

  // Only Blob-hosted files can be deleted from storage; external URLs
  // (old Transloadit links) just lose their DB row.
  if (asset.url.includes(".blob.vercel-storage.com/")) {
    await del(asset.url).catch(() => { /* row is gone; file cleanup is best-effort */ });
  }

  return NextResponse.json({ ok: true });
}
