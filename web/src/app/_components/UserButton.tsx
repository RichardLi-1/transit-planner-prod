"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";

export function UserButton() {
  const { user, isLoading } = useUser();

  if (isLoading) return null;

  if (!user) {
    return (
      <a
        href="/auth/login?returnTo=/map"
        className="pointer-events-auto flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="5" r="3" />
          <path d="M2 13.5c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5" />
        </svg>
        Sign in
      </a>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-stone-200 bg-white pl-1.5 pr-3 py-1.5 shadow-sm">
      {user.picture ? (
        <Image
          src={user.picture}
          alt={user.name ?? "User"}
          width={24}
          height={24}
          className="h-6 w-6 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
          {(user.name ?? user.email ?? "U")[0]?.toUpperCase()}
        </div>
      )}
      <span className="max-w-[120px] truncate text-sm font-medium text-stone-700">
        {user.name ?? user.email}
      </span>
      <a
        href="/auth/logout"
        className="ml-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
        title="Sign out"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6" />
        </svg>
      </a>
    </div>
  );
}
