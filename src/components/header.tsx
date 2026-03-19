'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  scrollTo?: string;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', scrollTo: 'home' },
  { label: 'Mentors', href: '/', scrollTo: 'mentors' },
  { label: 'About', href: '/', scrollTo: 'about' },
  { label: 'Contact', href: '/', scrollTo: 'contact' },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, scrollTo?: string) => {
    if (pathname === '/' && scrollTo) {
      e.preventDefault();
      const element = document.getElementById(scrollTo);
      if (element) {
        const headerOffset = 100; // Account for sticky header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
      setOpen(false);
    }
  };

  const hidden =
    pathname?.startsWith('/mentor') ||
    pathname?.startsWith('/mentee') ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/signup/mentor_secret';

  if (hidden) return null;

  return (
    <header
      className={cn(
        'absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-6xl transition-all duration-400',
        elevated ? 'scale-[1.002]' : 'scale-100'
      )}
    >
      <div
        className={cn(
          'relative px-2 md:px-4 h-16 flex items-center justify-between rounded-3xl'
        )}
      >
        {/* Brand */}
        <Link
          href="/"
          className="relative flex items-center gap-2 group select-none"
          aria-label="CONNEXT Home"
          onClick={(e) => handleNavClick(e, 'home')}
        >
          <span className="text-[26px] font-bold tracking-tight font-headline bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 bg-clip-text text-transparent transition-all group-hover:brightness-110 group-active:scale-95">
            CONNEXT
          </span>
          <span className="text-xs uppercase font-medium text-gray-600 tracking-wider bg-white/50 px-2 py-0.5 rounded-lg border border-white/40 shadow-sm">
            Beta
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const active = pathname === item.href && !item.scrollTo;
            return (
              <Link
                key={item.href + item.scrollTo}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.scrollTo)}
                className={cn(
                  'relative text-sm font-medium transition-all duration-300',
                  'px-2 py-1 rounded-lg',
                  'text-gray-700 hover:text-yellow-700 hover:bg-yellow-200/40 hover:shadow-[0_0_18px_rgba(234,179,8,0.45)]',
                  active &&
                    'text-gray-900 after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:rounded-full after:bg-gradient-to-r after:from-yellow-400 after:to-amber-500'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-3">
          <Button
            variant="ghost"
            asChild
            className="rounded-full border border-black/10 bg-transparent hover:bg-gradient-to-r hover:from-yellow-500 hover:to-amber-700 hover:text-white text-gray-900 font-medium transition-all"
          >
            <Link href="/login">Sign In</Link>
          </Button>
          <Button
            asChild
            className="rounded-full border border-black/10 bg-white/30 hover:bg-gradient-to-r hover:from-yellow-500 hover:to-amber-700 hover:text-white text-gray-900 font-semibold shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Link href="/signup">Sign Up</Link>
          </Button>
        </div>

        {/* Mobile menu toggle */}
        <button
          aria-label="Toggle navigation"
          className="md:hidden relative z-10 inline-flex items-center justify-center h-11 w-11 rounded-xl border border-white/50 bg-white/60 backdrop-blur-md shadow-sm active:scale-95 transition-all"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <X className="h-6 w-6 text-gray-700" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700" />
          )}
        </button>

        {/* Mobile panel */}
        {open && (
          <div
            className="absolute top-20 left-0 right-0 mx-auto w-full md:hidden animate-in fade-in zoom-in rounded-3xl border border-white/25 bg-white/80 backdrop-blur-xl shadow-2xl p-5 flex flex-col gap-4"
            role="dialog"
            aria-label="Mobile navigation"
          >
            <div className="grid gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href && !item.scrollTo;
                return (
                  <Link
                    key={item.href + item.scrollTo}
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item.scrollTo)}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all',
                      active
                        ? 'bg-gradient-to-r from-yellow-400/30 to-amber-400/30 text-gray-900 shadow-sm'
                        : 'bg-white/70 hover:bg-white text-gray-700 hover:text-gray-900',
                      'border border-white/50'
                    )}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-700 tracking-wide">
                        ACTIVE
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                asChild
                variant="ghost"
                className="w-full rounded-xl bg-white/70 hover:bg-gradient-to-r hover:from-yellow-500 hover:to-amber-700 hover:text-white text-gray-900 font-medium"
              >
                <Link href="/login">Sign In</Link>
              </Button>
              <Button
                asChild
                className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-700 hover:text-white text-black font-semibold shadow-md hover:shadow-lg"
              >
                <Link href="/signup">Sign Up</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
