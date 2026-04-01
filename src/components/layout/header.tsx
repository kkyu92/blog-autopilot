"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/topics", label: "키워드", icon: "🔍" },
  { href: "/posts", label: "콘텐츠", icon: "📝" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b px-4 h-14 md:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="md:hidden" />}
        >
          <span className="text-lg">☰</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="p-4 border-b text-lg font-bold">
            Content Autopilot
          </SheetTitle>
          <nav className="p-2 space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Page title area */}
      <div className="flex-1 md:ml-0" />

      {/* Right side actions */}
      <Link href="/topics">
        <Button size="sm">+ 새 글 작성</Button>
      </Link>
    </header>
  );
}
