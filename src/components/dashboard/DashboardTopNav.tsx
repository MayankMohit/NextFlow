import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { PenTool } from "lucide-react";

export default function DashboardTopNav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-3 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#1c1c1c]">
      <Link href="/" className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="NextFlow" width={26} height={26} />
        <span className="text-white font-semibold text-base">NextFlow</span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/workflow/new"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition-colors"
        >
          <PenTool size={12} />
          Open Editor
        </Link>
        <UserButton
          appearance={{ elements: { avatarBox: "w-7 h-7" } }}
        />
      </div>
    </nav>
  );
}
