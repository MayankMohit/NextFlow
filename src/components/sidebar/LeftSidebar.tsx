"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Search,
  Type,
  Image,
  Video,
  Brain,
  Crop,
  Film,
  LogOut,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/store/workflowStore";

const nodeButtons = [
  { label: "Text", icon: Type, type: "textNode" },
  { label: "Upload Image", icon: Image, type: "uploadImageNode" },
  { label: "Upload Video", icon: Video, type: "uploadVideoNode" },
  { label: "LLM", icon: Brain, type: "llmNode" },
  { label: "Crop Image", icon: Crop, type: "cropImageNode" },
  { label: "Extract Frame", icon: Film, type: "extractFrameNode" },
];

const MIN_WIDTH = 48;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 240;
const COLLAPSE_THRESHOLD = 80;

function generateUsername(user: any): string {
  if (user?.username) return user.username;
  if (user?.firstName) {
    const initial = user.firstName[0].toUpperCase();
    const random = Math.random().toString(36).slice(2, 6);
    return `${initial}_${random}`;
  }
  if (user?.emailAddresses?.[0]?.emailAddress) {
    const email = user.emailAddresses[0].emailAddress;
    return email.split("@")[0];
  }
  const random = Math.random().toString(36).slice(2, 8);
  return `user_${random}`;
}

export default function LeftSidebar() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const { addNode } = useWorkflowStore();

  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  const username = user ? generateUsername(user) : "...";
  const initial = username[0].toUpperCase();

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, startWidth.current + delta),
    );
    setWidth(newWidth);
    setCollapsed(newWidth < COLLAPSE_THRESHOLD);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    // snap closed or open
    if (width < COLLAPSE_THRESHOLD) {
      setWidth(MIN_WIDTH);
      setCollapsed(true);
    }
  }, [width]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const filtered = nodeButtons.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
  };

  const getInitialData = (type: string) => {
    switch (type) {
      case "textNode":
        return { label: "Text", text: "", status: "idle" };
      case "uploadImageNode":
        return { label: "Upload Image", imageUrl: null, status: "idle" };
      case "uploadVideoNode":
        return { label: "Upload Video", videoUrl: null, status: "idle" };
      case "llmNode":
        return {
          label: "LLM",
          model: "gemini-2.0-flash",
          result: null,
          status: "idle",
        };
      case "cropImageNode":
        return {
          label: "Crop Image",
          xPercent: 0,
          yPercent: 0,
          widthPercent: 100,
          heightPercent: 100,
          status: "idle",
        };
      case "extractFrameNode":
        return { label: "Extract Frame", timestamp: "0", status: "idle" };
      default:
        return { label: type, status: "idle" };
    }
  };

  const handleAddNode = (type: string) => {
    const newNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: {
        x: 200 + Math.random() * 100,
        y: 200 + Math.random() * 100,
      },
      data: getInitialData(type),
    };
    addNode(newNode);
  };

  return (
    <div
      style={{ width: `${width}px` }}
      className="relative h-full bg-[#141414] border-r border-[#2a2a2a] flex flex-col shrink-0 transition-none z-20"
    >
      {/* Logo */}
      <div className="p-3 border-b border-[#2a2a2a] flex items-center gap-2 overflow-hidden">
        <div className="w-6 h-6 rounded bg-violet-600 shrink-0" />
        {!collapsed && (
          <span className="text-white font-semibold text-sm truncate">
            NextFlow
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Search */}
          <div className="p-3 border-b border-[#2a2a2a]">
            <div className="flex items-center gap-2 bg-[#1c1c1c] rounded px-2 py-1.5">
              <Search size={14} className="text-[#666] shrink-0" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-white text-xs outline-none w-full placeholder:text-[#666]"
              />
            </div>
          </div>

          {/* Quick Access */}
          <div className="p-3 flex-1 overflow-y-auto">
            <p className="text-[#666] text-xs mb-2 uppercase tracking-wider">
              Quick Access
            </p>
            <div className="flex flex-col gap-1">
              {filtered.map((node) => (
                <button
                  key={node.type}
                  className="flex items-center gap-2 px-2 py-2 rounded hover:bg-[#2a2a2a] text-white text-sm w-full text-left transition-colors"
                  onClick={() => handleAddNode(node.type)}
                >
                  <node.icon size={15} className="text-violet-400 shrink-0" />
                  <span className="truncate">{node.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-[#666] text-xs">No nodes found</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Collapsed icons */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 p-2 mt-4 flex-1">
          {nodeButtons.map((node) => (
            <button
              key={node.type}
              title={node.label}
              className="text-violet-400 hover:text-white transition-colors"
              onClick={() => handleAddNode(node.type)}
            >
              <node.icon size={18} />
            </button>
          ))}
        </div>
      )}

      {/* User section */}
      <div className="border-t border-[#2a2a2a] p-2">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 w-full rounded hover:bg-[#2a2a2a] p-1.5 transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initial}
          </div>
          {!collapsed && (
            <span className="text-white text-xs truncate">{username}</span>
          )}
        </button>

        {userMenuOpen && (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 rounded hover:bg-red-500/20 text-red-400 text-xs transition-colors"
          >
            <LogOut size={13} />
            {!collapsed && <span>Sign out</span>}
          </button>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-violet-600/50 transition-colors z-30"
      />
    </div>
  );
}
