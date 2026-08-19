// page.tsx — Updated with new design from zip + vibrant rectangle institution logos

'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { Instagram, ArrowRight, Sparkles } from 'lucide-react';
import { getGoogleDriveImageUrl } from '@/lib/utils';

interface FeaturedMentor {
  id: string | number;
  name: string;
  expertise: string;
  image: string;
  hint: string;
}

interface InstitutionLogo {
  url: string;
  name: string;
}

const FAQ_ITEMS = [
  {
    q: "How do I find a mentor?",
    a: "Browse mentor profiles, filter by expertise, and book sessions directly through the platform.",
  },
  {
    q: "Are mentors verified?",
    a: "Yes, all mentors go through a vetting process to ensure quality and credibility.",
  },
  {
    q: "Do I have to pay for a session?",
    a: "No, all mentoring sessions are free. However, sessions are subject to the mentor's availability.",
  },
  {
    q: "How often can I request a mentoring session?",
    //TOKEN TEST 20 DAYS
    // a: "You can request a session at the earliest one week before the meeting date. After a token is used, there is a 30-day cooldown period. Once you submit the feedback form and the cooldown period is over, your token will be returned and you can make a new request.",
    a: "You can request a session at the earliest one week before the meeting date. After a token is used, there is a 20-day cooldown period. Once you submit the feedback form and the cooldown period is over, your token will be returned and you can make a new request.",
  },
  {
    q: "Can I become a mentor?",
    a: "Absolutely. Apply through our platform and we'll review your profile.",
  },
];

// Fallback institutions shown when no real logos are fetched yet
const FALLBACK_INSTITUTIONS = [
  { abbr: 'UTM',     name: 'Universiti Teknologi Malaysia' },
  { abbr: 'UM',      name: 'Universiti Malaya' },
  { abbr: 'UPM',     name: 'Universiti Putra Malaysia' },
  { abbr: 'UKM',     name: 'Universiti Kebangsaan Malaysia' },
  { abbr: 'UiTM',    name: 'Universiti Teknologi MARA' },
  { abbr: 'MMU',     name: 'Multimedia University' },
  { abbr: 'UTAR',    name: 'Universiti Tunku Abdul Rahman' },
  { abbr: "Taylor's",name: "Taylor's University" },
  { abbr: 'Sunway',  name: 'Sunway University' },
  { abbr: 'APU',     name: 'Asia Pacific University' },
  { abbr: 'UCSI',    name: 'UCSI University' },
  { abbr: 'UTP',     name: 'Universiti Teknologi Petronas' },
  { abbr: 'Monash',  name: 'Monash University Malaysia' },
  { abbr: 'UNITEN',  name: 'Universiti Tenaga Nasional' },
];

export default function Home() {
  const [featuredMentors, setFeaturedMentors] = useState<FeaturedMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [curatedLogos, setCuratedLogos] = useState<InstitutionLogo[]>([]);
  const [mentorPage, setMentorPage] = useState(0);
  const [floatingNav, setFloatingNav] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const mentorsPerPage = 4;
  const isPlaceholderMentor = (name: string) => /^\s*test\s*$/i.test(name);

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const response = await fetch('/api/mentors/featured');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (data.success && data.mentors && data.mentors.length > 0) {
          const sanitizedMentors = data.mentors.filter(
            (mentor: FeaturedMentor) => mentor?.name && !isPlaceholderMentor(mentor.name)
          );
          setFeaturedMentors(sanitizedMentors);
        } else {
          setFetchError(data.message || 'No mentors found');
        }
      } catch (error) {
        setFetchError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchMentors();
  }, []);

  useEffect(() => {
    fetch('/api/mentor-logos')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.logos)) setCuratedLogos(data.logos); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      setFloatingNav(heroBottom < 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.scroll-reveal'));
    if (elements.length === 0) return;
    let lastScrollY = window.scrollY;
    let isScrollingUp = false;
    const handleDirection = () => {
      const currentY = window.scrollY;
      isScrollingUp = currentY < lastScrollY;
      lastScrollY = currentY;
    };
    window.addEventListener('scroll', handleDirection, { passive: true });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
          else if (isScrollingUp) entry.target.classList.remove('is-visible');
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    elements.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleDirection);
    };
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const totalPages = Math.ceil(featuredMentors.length / mentorsPerPage);
  const visibleMentors = featuredMentors.slice(mentorPage * mentorsPerPage, mentorPage * mentorsPerPage + mentorsPerPage);
  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

  // Logos are whatever image files currently sit in public/Mentor Logos/, discovered
  // via /api/mentor-logos — falls back to text pills if that folder is empty.
  const hasRealLogos = curatedLogos.length > 0;
  const marqueeLogos = hasRealLogos
    ? [...curatedLogos, ...curatedLogos, ...curatedLogos]
    : [...FALLBACK_INSTITUTIONS, ...FALLBACK_INSTITUTIONS, ...FALLBACK_INSTITUTIONS];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --yellow:      #F5C518;
          --yellow-d:    #C9A007;
          --yellow-soft: rgba(245, 197, 24, 0.10);
          --yellow-mid:  rgba(245, 197, 24, 0.22);
          --cream:       #FFFDF4;
          --cream-2:     #FFF8E1;
          --white:       #FFFFFF;
          --black:       #0A0A0A;
          --charcoal:    #1C1C1E;
          --mid:         #6B6869;
          --border:      rgba(0,0,0,0.09);
          --border-y:    rgba(245,197,24,0.28);
        }

        html { scroll-behavior: smooth; overflow-x: hidden; }

        body {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: var(--black);
          background: #FFFDF4;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        .page-canvas {
          background: linear-gradient(
            180deg,
            #FFFDF4   0%,
            #FFF8E1  14%,
            #FFFEF9  32%,
            #FFFFFF  50%,
            #FFFBEE  68%,
            #FFF8D8  82%,
            #FFFDF4  94%,
            #FFFDF4 100%
          );
        }

        section {
          position: relative;
          padding: 96px 40px;
          overflow-x: clip;
          overflow-y: visible;
          background: transparent;
        }

        /* ─── SCROLL REVEAL ─── */
        .scroll-reveal {
          opacity: 0;
          transform: translateY(26px);
          transition: opacity 0.75s ease, transform 0.75s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform;
        }
        .scroll-reveal.is-visible { opacity: 1; transform: translateY(0); }
        .scroll-reveal[data-delay="1"] { transition-delay: 0.08s; }
        .scroll-reveal[data-delay="2"] { transition-delay: 0.16s; }
        .scroll-reveal[data-delay="3"] { transition-delay: 0.24s; }
        .scroll-reveal[data-delay="4"] { transition-delay: 0.32s; }

        /* ─── DECORATIVE GLOW ─── */
        .soft-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(circle, rgba(245,197,24,0.18) 0%, transparent 68%);
          filter: blur(40px);
        }

        /* ─── FLOATING NAV ─── */
        .floating-nav {
          position: fixed;
          top: 14px; left: 50%;
          transform: translateX(-50%) translateY(-10px) scale(0.97);
          z-index: 1000;
          width: calc(100% - 48px);
          max-width: 960px;
          height: 54px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px;
          border-radius: 16px;
          background: rgba(255, 253, 244, 0.72);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid rgba(245,197,24,0.25);
          box-shadow: 0 8px 32px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.8) inset;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22,1,0.36,1);
        }
        .floating-nav.visible {
          opacity: 1;
          pointer-events: all;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        .fnav-logo {
          font-family: 'DM Serif Display', serif;
          font-size: 17px; font-weight: 400;
          color: var(--black); text-decoration: none;
          display: flex; align-items: center; gap: 6px;
          letter-spacing: -0.01em; flex-shrink: 0;
        }
        .fnav-links { display: flex; align-items: center; gap: 2px; list-style: none; }
        .fnav-links button {
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          color: var(--mid); background: none; border: none; cursor: pointer;
          padding: 6px 12px; border-radius: 8px;
          transition: color 0.18s, background 0.18s;
        }
        .fnav-links button:hover { color: var(--black); background: rgba(245,197,24,0.1); }
        .fnav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .fnav-signin {
          font-size: 13px; font-weight: 400;
          color: var(--charcoal); text-decoration: none;
          padding: 6px 14px; border-radius: 8px;
          transition: background 0.15s;
        }
        .fnav-signin:hover { background: rgba(0,0,0,0.05); }
        .fnav-signup {
          font-size: 13px; font-weight: 600;
          color: var(--black); text-decoration: none;
          padding: 7px 17px; border-radius: 9px;
          background: var(--yellow);
          box-shadow: 0 2px 12px rgba(245,197,24,0.4);
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
        }
        .fnav-signup:hover { background: #EDBB10; transform: translateY(-1px); box-shadow: 0 4px 18px rgba(245,197,24,0.5); }

        /* ─── HERO NAV ─── */
        .hero-nav {
          position: relative; z-index: 10;
          max-width: 1100px; margin: 0 auto;
          padding: 26px 40px 0;
          display: flex; align-items: center; justify-content: space-between;
        }
        .hero-nav-logo {
          font-family: 'DM Serif Display', serif; font-size: 21px; font-weight: 400;
          color: var(--black); text-decoration: none; letter-spacing: -0.01em;
          display: flex; align-items: center; gap: 7px; flex-shrink: 0;
        }
        .hero-nav-badge {
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--yellow-d); background: rgba(245,197,24,0.15);
          border: 1px solid rgba(245,197,24,0.3); padding: 2px 8px; border-radius: 4px;
        }
        .hero-nav-links { display: flex; align-items: center; gap: 2px; list-style: none; }
        .hero-nav-links button {
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 400;
          color: var(--charcoal); background: none; border: none; cursor: pointer;
          padding: 7px 14px; border-radius: 8px;
          transition: color 0.15s, background 0.15s;
        }
        .hero-nav-links button:hover { color: var(--black); background: rgba(245,197,24,0.12); }
        .hero-nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .hero-nav-signin {
          font-size: 14px; font-weight: 400; color: var(--charcoal); text-decoration: none;
          padding: 8px 16px; border-radius: 9px;
          border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.7);
          transition: all 0.15s;
        }
        .hero-nav-signin:hover { background: var(--white); border-color: rgba(0,0,0,0.22); }
        .hero-nav-signup {
          font-size: 14px; font-weight: 600; color: var(--black); text-decoration: none;
          padding: 9px 22px; border-radius: 9px;
          background: var(--yellow);
          box-shadow: 0 4px 18px rgba(245,197,24,0.38);
          transition: all 0.18s;
        }
        .hero-nav-signup:hover { background: #EDBB10; transform: translateY(-1px); box-shadow: 0 6px 22px rgba(245,197,24,0.5); }
        .hero-mobile-toggle {
          display: none;
          background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.1);
          border-radius: 8px; width: 40px; height: 40px;
          align-items: center; justify-content: center;
          cursor: pointer; flex-direction: column; gap: 4.5px; padding: 0;
        }
        .hero-mobile-toggle span {
          display: block; width: 18px; height: 1.5px;
          background: var(--black); border-radius: 1px; transition: all 0.22s;
        }
        .mobile-nav-panel {
          position: absolute; top: 76px; left: 16px; right: 16px;
          background: var(--white); border: 1px solid var(--border); border-radius: 14px;
          padding: 14px; z-index: 20; box-shadow: 0 12px 48px rgba(0,0,0,0.1);
          display: flex; flex-direction: column; gap: 2px;
        }
        .mobile-nav-panel button {
          font-size: 15px; font-weight: 400; color: var(--charcoal);
          background: none; border: none; cursor: pointer;
          padding: 11px 14px; border-radius: 8px; text-align: left; transition: background 0.15s;
        }
        .mobile-nav-panel button:hover { background: var(--cream-2); }
        .mobile-nav-divider { height: 1px; background: var(--border); margin: 6px 0; }
        .mobile-nav-cta { display: flex; gap: 8px; }
        .mobile-nav-cta a {
          flex: 1; text-align: center; font-size: 14px; font-weight: 500;
          padding: 10px; border-radius: 9px; text-decoration: none; transition: all 0.15s;
        }
        .m-signin { color: var(--charcoal); border: 1px solid var(--border); background: var(--white); }
        .m-signup { color: var(--black); background: var(--yellow); }

        /* ─── HERO CONTENT ─── */
        .hero-section { padding: 0; }
        .hero-section::before {
          content: '';
          position: absolute; top: -80px; right: -80px;
          width: clamp(180px, 38vw, 480px); height: clamp(180px, 38vw, 480px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(245,197,24,0.22) 0%, transparent 60%);
          pointer-events: none;
        }
        .hero-content {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto;
          padding: 72px 40px 48px; text-align: center;
        }
        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 12px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--yellow-d); margin-bottom: 18px;
          animation: fadeUp 0.55s ease both;
        }
        .hero-eyebrow-line { width: 24px; height: 1.5px; background: var(--yellow-d); border-radius: 1px; }
        .hero-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(50px, 7.8vw, 100px);
          font-weight: 400; line-height: 1.0; letter-spacing: -0.03em;
          color: var(--black); margin-bottom: 18px;
          animation: fadeUp 0.55s 0.08s ease both;
        }
        .hero-title em {
          font-style: italic; position: relative; display: inline-block;
          color: var(--black);
        }
        .hero-title em::after {
          content: '';
          position: absolute; left: -2px; right: -2px; bottom: 6px;
          height: 11px; background: var(--yellow); z-index: -1;
          border-radius: 3px; opacity: 0.75;
        }
        .hero-desc {
          font-size: 18px; line-height: 1.74; color: var(--mid);
          max-width: 460px; margin: 0 auto 28px; font-weight: 300;
          animation: fadeUp 0.55s 0.14s ease both;
        }
        .hero-cta {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; flex-wrap: wrap;
          animation: fadeUp 0.55s 0.2s ease both;
        }
        .btn-primary {
          font-size: 14px; font-weight: 700;
          padding: 11px 24px; border-radius: 9px; border: none;
          background: var(--yellow); color: var(--black); cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; gap: 7px;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 20px rgba(245,197,24,0.45);
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .btn-primary:hover { background: #EDBB10; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(245,197,24,0.55); }
        .btn-ghost {
          font-size: 15px; font-weight: 500;
          padding: 14px 26px; border-radius: 10px;
          border: 1.5px solid rgba(0,0,0,0.15);
          background: rgba(255,255,255,0.8); color: var(--charcoal); cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
          transition: all 0.2s;
        }
        .btn-ghost:hover { border-color: rgba(245,197,24,0.55); background: var(--white); color: var(--black); }

        /* ─── FREE BADGE ─── */
        .free-badge {
          display: inline-flex; align-items: center; gap: 8px;
          margin-top: 28px;
          padding: 10px 20px; border-radius: 100px;
          background: rgba(245,197,24,0.14);
          border: 1.5px solid rgba(245,197,24,0.38);
          animation: fadeUp 0.55s 0.26s ease both;
        }
        .free-badge-icon { color: var(--yellow-d); display: flex; align-items: center; }
        .free-badge-icon svg { width: 14px; height: 14px; }
        .free-badge-text { font-size: 13px; font-weight: 600; color: var(--black); letter-spacing: -0.01em; }
        .free-badge-sub { font-size: 12px; font-weight: 400; color: var(--mid); }

        /* ══════════════════════════════════════════════════
           INSTITUTION LOGOS — vibrant rectangle cards
           Visible immediately (no fade-in on load),
           animated marquee strip
        ══════════════════════════════════════════════════ */
        .institutions-strip {
          width: 100%;
          padding: 24px 0 0;
          animation: fadeUp 0.55s 0.32s ease both;
        }
        .institutions-label {
          display: flex; align-items: center; gap: 14px;
          max-width: 1100px; margin: 0 auto 18px; padding: 0 40px;
        }
        .institutions-label-line { flex: 1; height: 1px; background: rgba(0,0,0,0.1); }
        .institutions-label-text {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--mid); white-space: nowrap;
        }

        /* Marquee track */
        .institutions-marquee-wrap {
          /*
            overflow-x clips the scrolling content at the edges.
            overflow-y MUST be visible so the card lift on hover
            is never clipped at the top.
            Use padding-block on the track instead for the hover lift room.
          */
          overflow-x: hidden;
          overflow-y: visible;
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%);
          mask-image: linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%);
        }
        .institutions-marquee-track {
          display: flex;
          gap: 12px;
          width: max-content;
          /* Vertical padding gives cards room to lift on hover without being clipped */
          padding-top: 10px;
          padding-bottom: 10px;
          animation: marquee-scroll 42s linear infinite;
        }
        .institutions-marquee-track:hover { animation-play-state: paused; }

        @keyframes marquee-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }

        /* ── Rectangle logo card (real image logos) ── */
        .inst-logo-card {
          flex-shrink: 0;
          width: 160px;
          height: 72px;
          border-radius: 10px;
          background: #FFFFFF;
          border: 1.5px solid rgba(245,197,24,0.35);
          display: flex; align-items: center; justify-content: center;
          padding: 10px 14px;
          /* No overflow:hidden — lets the card itself scale freely on hover */
          cursor: default;
          box-shadow: 0 2px 10px rgba(245,197,24,0.12), 0 1px 3px rgba(0,0,0,0.06);
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          position: relative;
        }
        .inst-logo-card::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(245,197,24,0.06) 0%, transparent 60%);
          border-radius: inherit;
          pointer-events: none;
        }
        .inst-logo-card:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 8px 24px rgba(245,197,24,0.3), 0 2px 6px rgba(0,0,0,0.08);
          border-color: rgba(245,197,24,0.7);
        }
        .inst-logo-card img {
          max-width: 100%; max-height: 48px;
          object-fit: contain;
          /* VIBRANT: no opacity dimming — full colour logos */
          opacity: 1;
          transition: transform 0.2s ease;
        }
        .inst-logo-card:hover img { transform: scale(1.06); }

        /* ── Rectangle text pill (fallback, no logo) ── */
        .inst-text-pill {
          flex-shrink: 0;
          height: 72px;
          padding: 0 24px;
          border-radius: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          background: #FFFFFF;
          border: 1.5px solid rgba(245,197,24,0.35);
          box-shadow: 0 2px 10px rgba(245,197,24,0.12), 0 1px 3px rgba(0,0,0,0.06);
          cursor: default;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          position: relative;
        }
        .inst-text-pill::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(245,197,24,0.07) 0%, transparent 60%);
          pointer-events: none;
        }
        .inst-text-pill:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 8px 24px rgba(245,197,24,0.3), 0 2px 6px rgba(0,0,0,0.08);
          border-color: rgba(245,197,24,0.7);
        }
        .inst-abbr {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 700;
          color: var(--black); letter-spacing: 0.02em;
          line-height: 1;
        }
        .inst-full {
          font-family: 'DM Sans', sans-serif;
          font-size: 9px; font-weight: 400;
          color: var(--mid); letter-spacing: 0.01em;
          line-height: 1; text-align: center;
          max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        /* Yellow accent dot on top-left corner */
        .inst-accent-dot {
          position: absolute; top: 8px; left: 9px;
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--yellow);
          opacity: 0.8;
        }

        /* ─── MENTORS ─── */
        .mentors-section { padding-top: 72px; }
        .mentors-inner { max-width: 1100px; margin: 0 auto; }
        .mentors-header {
          display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 44px;
        }
        .section-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--yellow-d); margin-bottom: 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .section-eyebrow::after { content: ''; width: 20px; height: 1.5px; background: var(--yellow); border-radius: 1px; }
        .mentors-title {
          font-family: 'DM Serif Display', serif; font-size: clamp(34px, 4.2vw, 54px);
          font-weight: 400; line-height: 1.06; letter-spacing: -0.025em; color: var(--black);
        }
        .mentors-title em { font-style: italic; color: var(--yellow-d); }
        .mentors-subtitle {
          font-size: 14px; color: var(--mid); max-width: 240px;
          text-align: right; line-height: 1.78; font-weight: 300;
        }
        .mentors-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .mentor-card {
          background: var(--white); border: 1px solid var(--border); border-radius: 14px;
          padding: 24px; cursor: pointer; position: relative; overflow: hidden;
          transition: border-color 0.28s, transform 0.22s, box-shadow 0.28s;
        }
        .mentor-card::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2.5px;
          background: linear-gradient(90deg, var(--yellow), var(--yellow-d));
          transform: scaleX(0); transform-origin: left; transition: transform 0.3s ease;
        }
        .mentor-card:hover { border-color: var(--border-y); transform: translateY(-3px); box-shadow: 0 8px 28px rgba(245,197,24,0.14); }
        .mentor-card:hover::after { transform: scaleX(1); }
        .mentor-avatar {
          width: 60px; height: 60px; border-radius: 50%;
          background: var(--yellow); margin-bottom: 16px; overflow: hidden; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Serif Display', serif; font-size: 19px; color: var(--black);
          border: 2px solid rgba(245,197,24,0.3);
        }
        .mentor-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .mentor-name { font-size: 15px; font-weight: 500; color: var(--black); margin-bottom: 3px; letter-spacing: -0.01em; }
        .mentor-role { font-size: 12px; color: var(--mid); margin-bottom: 16px; line-height: 1.6; font-weight: 300; }
        .mentor-tags { display: flex; flex-wrap: wrap; gap: 5px; }
        .mentor-tag {
          font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
          padding: 3px 9px; border: 1px solid var(--border-y); color: var(--yellow-d);
          border-radius: 5px; background: rgba(245,197,24,0.06); transition: all 0.2s;
        }
        .mentor-card:hover .mentor-tag { background: rgba(245,197,24,0.12); }
        .mentors-nav { display: flex; gap: 8px; margin-top: 30px; }
        .mentors-nav-btn {
          width: 40px; height: 40px; border-radius: 9px;
          border: 1px solid rgba(0,0,0,0.15); background: transparent; color: var(--mid);
          font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .mentors-nav-btn:hover:not(:disabled) { border-color: var(--yellow); color: var(--yellow-d); background: rgba(245,197,24,0.07); }
        .mentors-nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .mentor-loading {
          grid-column: 1 / -1; padding: 64px;
          display: flex; align-items: center; justify-content: center;
          color: #333; font-size: 14px; font-weight: 300;
        }

        /* ─── ABOUT ─── */
        .about-section { padding-top: 80px; }
        .about-inner { max-width: 1100px; margin: 0 auto; }
        .about-eyebrow-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .about-eyebrow-text {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--mid); white-space: nowrap;
        }
        .about-eyebrow-line { flex: 1; height: 1px; background: rgba(0,0,0,0.09); }
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 44px; }
        .about-card {
          padding: 48px 44px; border: 1px solid rgba(0,0,0,0.08); border-radius: 18px;
          position: relative; overflow: hidden;
          background: rgba(255,255,255,0.82);
          backdrop-filter: blur(8px);
          transition: border-color 0.28s, transform 0.22s, box-shadow 0.28s;
        }
        .about-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--yellow) 0%, transparent 100%);
          opacity: 0; transition: opacity 0.3s;
        }
        .about-card:hover { border-color: rgba(245,197,24,0.3); transform: translateY(-2px); box-shadow: 0 10px 36px rgba(245,197,24,0.1); }
        .about-card:hover::before { opacity: 1; }
        .about-card-num {
          font-family: 'DM Serif Display', serif; font-size: 76px; font-weight: 400;
          color: rgba(245,197,24,0.3); line-height: 1; margin-bottom: 6px;
          letter-spacing: -0.04em; transition: color 0.3s; user-select: none;
        }
        .about-card:hover .about-card-num { color: rgba(245,197,24,0.55); }
        .about-card-tag {
          font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--yellow-d); margin-bottom: 10px;
          display: flex; align-items: center; gap: 8px;
        }
        .about-card-tag::before { content: ''; width: 14px; height: 2px; background: var(--yellow); border-radius: 1px; }
        .about-card-title {
          font-family: 'DM Serif Display', serif; font-size: 28px; font-weight: 400;
          letter-spacing: -0.02em; color: var(--black); margin-bottom: 14px; line-height: 1.15;
        }
        .about-card-text { font-size: 15px; color: var(--mid); line-height: 1.84; font-weight: 300; }

        /* ─── CTA ─── */
        .cta-section {
          margin: 64px 40px 0;
          padding: 80px 60px;
          border-radius: 24px;
          background: linear-gradient(135deg, var(--yellow) 0%, #EDBB10 55%, #D4A30F 100%);
          position: relative;
          overflow: hidden;
          text-align: center;
        }
        .cta-section::before {
          content: '';
          position: absolute; top: -60px; right: -60px;
          width: 320px; height: 320px; border-radius: 50%;
          background: rgba(255,255,255,0.12);
          pointer-events: none;
        }
        .cta-section::after {
          content: '';
          position: absolute; bottom: -40px; left: -40px;
          width: 200px; height: 200px; border-radius: 50%;
          background: rgba(0,0,0,0.04);
          pointer-events: none;
        }
        .cta-inner { position: relative; z-index: 1; max-width: 520px; margin: 0 auto; }
        .cta-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(0,0,0,0.55); margin-bottom: 18px;
        }
        .cta-title {
          font-family: 'DM Serif Display', serif; font-size: clamp(42px, 5vw, 68px);
          font-weight: 400; line-height: 1.04; letter-spacing: -0.03em;
          color: var(--black); margin-bottom: 18px;
        }
        .cta-title em { font-style: italic; color: rgba(0,0,0,0.65); }
        .cta-sub { font-size: 16px; color: rgba(0,0,0,0.6); line-height: 1.78; margin-bottom: 36px; font-weight: 300; }
        .btn-cta {
          font-size: 15px; font-weight: 700; padding: 14px 34px; border-radius: 11px;
          border: none; background: var(--black); color: var(--white); cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 22px rgba(0,0,0,0.22);
        }
        .btn-cta:hover { background: #1C1C1E; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.32); }

        /* ─── FAQ ─── */
        .faq-section { padding-top: 80px; }
        .faq-inner { max-width: 860px; margin: 0 auto; }
        .faq-header { text-align: center; margin-bottom: 48px; }
        .faq-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yellow-d); margin-bottom: 12px; }
        .faq-title { font-family: 'DM Serif Display', serif; font-size: clamp(36px, 4vw, 50px); color: var(--black); letter-spacing: -0.025em; }
        .faq-list { display: flex; flex-direction: column; gap: 10px; }
        .faq-item {
          padding: 20px 24px; border-radius: 12px;
          background: rgba(255,255,255,0.82); border: 1px solid var(--border);
          cursor: pointer; transition: border-color 0.22s, transform 0.2s, box-shadow 0.22s;
        }
        .faq-item:hover { border-color: var(--border-y); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(245,197,24,0.08); }
        .faq-item.active { border-color: rgba(245,197,24,0.4); box-shadow: 0 10px 28px rgba(245,197,24,0.1); }
        .faq-question-row {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          gap: 16px; background: none; border: none; padding: 0; text-align: left; cursor: pointer;
        }
        .faq-question { font-size: 15px; font-weight: 500; color: var(--black); }
        .faq-icon {
          width: 28px; height: 28px; border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.1);
          display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
          color: var(--mid); font-size: 18px; line-height: 1;
          transition: transform 0.22s ease, background 0.22s ease, border-color 0.22s ease;
        }
        .faq-item.active .faq-icon { transform: rotate(45deg); background: rgba(245,197,24,0.15); border-color: rgba(245,197,24,0.4); }
        .faq-answer {
          max-height: 0; overflow: hidden; opacity: 0; margin-top: 0;
          font-size: 14.5px; color: var(--mid); line-height: 1.74; font-weight: 300;
          transition: max-height 0.3s ease, opacity 0.26s ease, margin-top 0.26s ease;
        }
        .faq-item.active .faq-answer { max-height: 200px; opacity: 1; margin-top: 12px; }

        /* ─── FOOTER ─── */
        .footer { background: var(--black); padding: 72px 40px 44px; margin-top: 80px; }
        .footer-inner { max-width: 1100px; margin: 0 auto; }
        .footer-top { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 48px; margin-bottom: 56px; }
        .footer-logo {
          font-family: 'DM Serif Display', serif; font-size: 20px; font-weight: 400;
          letter-spacing: -0.01em; color: var(--white); text-decoration: none;
          display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px;
        }
        .footer-tagline { font-size: 13.5px; color: rgba(255,255,255,0.55); line-height: 1.78; max-width: 230px; font-weight: 300; }
        .footer-col-title { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.9); margin-bottom: 18px; }
        .footer-col-links { list-style: none; display: flex; flex-direction: column; gap: 11px; }
        .footer-col-links a { font-size: 13.5px; color: rgba(255,255,255,0.55); text-decoration: none; transition: color 0.15s; font-weight: 300; }
        .footer-col-links a:hover { color: var(--yellow); }
        .footer-social {
          display: inline-flex; align-items: center; gap: 8px; width: fit-content;
          font-size: 13.5px; color: rgba(255,255,255,0.55); font-weight: 300;
        }
        .footer-social svg { width: 15px; height: 15px; color: rgba(255,255,255,0.7); }
        .footer-social-note { font-size: 11px; color: rgba(255,255,255,0.3); }
        .footer-bottom {
          display: flex; justify-content: space-between; align-items: center;
          padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.08);
        }
        .footer-copy { font-size: 12.5px; color: rgba(255,255,255,0.4); font-weight: 300; }
        .footer-badge {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 5px 13px; border: 1px solid #1e1e1e; color: #2c2c2c; border-radius: 100px;
        }
        .footer-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--yellow); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1023px) {
          section { padding: 80px 32px; }
          .mentors-grid { grid-template-columns: 1fr 1fr; }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .cta-section { margin: 48px 24px 0; padding: 64px 40px; }
          .inst-logo-card, .inst-text-pill { width: 140px; height: 64px; }
        }

        @media (max-width: 767px) {
          section { padding: 56px 20px; }
          .hero-nav { padding: 18px 20px 0; }
          .hero-nav-links, .hero-nav-actions { display: none; }
          .hero-mobile-toggle { display: flex; }
          .hero-content { padding: 52px 20px 36px; }
          .hero-desc { font-size: 16px; max-width: 100%; margin-bottom: 28px; }
          .hero-cta { flex-direction: column; align-items: stretch; gap: 8px; }
          .btn-primary { justify-content: center; text-align: center; width: 100%; }
          .free-badge { flex-direction: column; gap: 4px; padding: 12px 18px; }
          .institutions-label { padding: 0 20px; }
          .inst-logo-card, .inst-text-pill { width: 130px; height: 60px; }
          .mentors-header { flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 22px; }
          .mentors-subtitle { text-align: left; max-width: 100%; }
          .mentors-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .mentor-card { padding: 16px; }
          .about-grid { grid-template-columns: 1fr; gap: 10px; }
          .about-card { padding: 32px 24px; }
          .cta-section { margin: 40px 16px 0; padding: 56px 28px; border-radius: 20px; }
          .footer { padding: 52px 20px 36px; }
          .footer-top { grid-template-columns: 1fr; gap: 28px; }
          .footer-bottom { flex-direction: column; gap: 14px; text-align: center; }
          .floating-nav { width: calc(100% - 28px); padding: 0 16px; }
          .fnav-links { display: none; }
        }

        @media (max-width: 479px) {
          .mentors-grid { grid-template-columns: 1fr; }
          .fnav-signin { display: none; }
          .inst-logo-card, .inst-text-pill { width: 118px; height: 56px; }
        }
      `}</style>

      {/* ─── FLOATING NAV ─── */}
      <nav className={`floating-nav ${floatingNav ? 'visible' : ''}`} aria-label="Floating navigation">
        <Link href="/" className="fnav-logo">
          <img src="/logo.jpeg" alt="Connext logo" style={{ height: '26px', width: 'auto', display: 'block' }} />
        </Link>
        <ul className="fnav-links">
          <li><button onClick={() => scrollToSection('home')}>Home</button></li>
          <li><button onClick={() => scrollToSection('mentors')}>Mentors</button></li>
          <li><button onClick={() => scrollToSection('about')}>About</button></li>
          <li><button onClick={() => scrollToSection('faq')}>FAQ</button></li>
          <li><button onClick={() => scrollToSection('contact')}>Contact</button></li>
        </ul>
        <div className="fnav-actions">
          <Link href="/login" className="fnav-signin">Sign In</Link>
          <Link href="/signup" className="fnav-signup">Get Started</Link>
        </div>
      </nav>

      {/* ─── PAGE CANVAS ─── */}
      <div className="page-canvas">

        {/* ─── HERO ─── */}
        <section className="hero-section scroll-reveal is-visible" id="home" ref={heroRef}>
          <div className="soft-glow" style={{ width: 560, height: 560, top: -120, right: -120 } as React.CSSProperties} />
          <div className="soft-glow" style={{ width: 300, height: 300, bottom: 60, left: '8%', opacity: 0.5 } as React.CSSProperties} />

          <div style={{ position: 'relative' }}>
            <nav className="hero-nav" aria-label="Primary navigation">
              <Link href="/" className="hero-nav-logo">
                <img src="/logo.jpeg" alt="Connext logo" style={{ height: '34px', width: 'auto', display: 'block' }} />
                <span className="hero-nav-badge">Beta</span>
              </Link>
              <ul className="hero-nav-links">
                <li><button onClick={() => scrollToSection('home')}>Home</button></li>
                <li><button onClick={() => scrollToSection('mentors')}>Mentors</button></li>
                <li><button onClick={() => scrollToSection('about')}>About</button></li>
                <li><button onClick={() => scrollToSection('faq')}>FAQ</button></li>
                <li><button onClick={() => scrollToSection('contact')}>Contact</button></li>
              </ul>
              <div className="hero-nav-actions">
                <Link href="/login" className="hero-nav-signin">Sign In</Link>
                <Link href="/signup" className="hero-nav-signup">Get Started</Link>
              </div>
              <button
                className="hero-mobile-toggle"
                aria-label="Toggle navigation"
                onClick={() => setMobileMenuOpen(o => !o)}
              >
                <span style={{ transform: mobileMenuOpen ? 'rotate(45deg) translateY(6px)' : undefined }} />
                <span style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
                <span style={{ transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-6px)' : undefined }} />
              </button>
            </nav>

            {mobileMenuOpen && (
              <div className="mobile-nav-panel" role="dialog" aria-label="Mobile navigation">
                <button onClick={() => scrollToSection('home')}>Home</button>
                <button onClick={() => scrollToSection('mentors')}>Mentors</button>
                <button onClick={() => scrollToSection('about')}>About</button>
                <button onClick={() => scrollToSection('faq')}>FAQ</button>
                <button onClick={() => scrollToSection('contact')}>Contact</button>
                <div className="mobile-nav-divider" />
                <div className="mobile-nav-cta">
                  <Link href="/login" className="m-signin">Sign In</Link>
                  <Link href="/signup" className="m-signup">Get Started</Link>
                </div>
              </div>
            )}
          </div>

          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-line" />
              Malaysia&apos;s Professional Mentorship Platform
              <span className="hero-eyebrow-line" />
            </div>

            <h1 className="hero-title">
              Unlock your<br /><em>potential</em>
            </h1>

            <p className="hero-desc">
              Connect with experienced professionals, and accelerate your career through expert mentorship
            </p>

            <div className="hero-cta">
              <Link href="/signup" className="btn-primary">
                Get Started <ArrowRight size={16} />
              </Link>
            </div>

            <div className="free-badge">
              <span className="free-badge-icon"><Sparkles size={14} /></span>
              <span className="free-badge-text">100% Free to Join</span>
            </div>

            {/* ══════════════════════════════════════════════
                INSTITUTION LOGOS — vibrant rectangle cards
                Immediately visible, continuous marquee
            ══════════════════════════════════════════════ */}
            <div className="institutions-strip">
              <div className="institutions-label">
                <div className="institutions-label-line" />
                <span className="institutions-label-text">Mentors from leading institutions/companies</span>
                <div className="institutions-label-line" />
              </div>

              <div className="institutions-marquee-wrap">
                <div className="institutions-marquee-track">
                  {hasRealLogos
                    ? marqueeLogos.map((logo, i) => (
                        <div key={`logo-${i}`} className="inst-logo-card" title={logo.name}>
                          <span className="inst-accent-dot" />
                          <img
                            src={logo.url}
                            alt={logo.name}
                            loading="eager"
                            onError={(e) => {
                              // Graceful fallback: hide broken img, show institution name
                              const card = e.currentTarget.closest('.inst-logo-card') as HTMLElement;
                              if (card) {
                                e.currentTarget.style.display = 'none';
                                const existing = card.querySelector('.inst-abbr');
                                if (!existing) {
                                  const abbr = document.createElement('span');
                                  abbr.className = 'inst-abbr';
                                  abbr.textContent = logo.name.length > 10
                                    ? logo.name.slice(0, 4).toUpperCase()
                                    : logo.name;
                                  card.appendChild(abbr);
                                }
                              }
                            }}
                          />
                        </div>
                      ))
                    : (marqueeLogos as typeof FALLBACK_INSTITUTIONS).map((inst, i) => (
                        <div key={`inst-${i}`} className="inst-text-pill" title={inst.name}>
                          <span className="inst-accent-dot" />
                          <span className="inst-abbr">{inst.abbr}</span>
                          <span className="inst-full">{inst.name}</span>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── MENTORS ─── */}
        <section className="mentors-section scroll-reveal" id="mentors" data-delay="1">
          <div className="soft-glow" style={{ width: 500, height: 500, top: -100, left: '50%', transform: 'translateX(-50%)' } as React.CSSProperties} />
          <div className="mentors-inner">
            <div className="mentors-header">
              <div>
                <div className="section-eyebrow">Expert Mentors</div>
                <h2 className="mentors-title">Learn from<br /><em>industry leaders</em></h2>
              </div>
              <p className="mentors-subtitle">
                Experienced professionals passionate about helping you grow and succeed.
              </p>
            </div>

            <div className="mentors-grid">
              {loading ? (
                <div className="mentor-loading">Loading mentors…</div>
              ) : visibleMentors.length > 0 ? (
                visibleMentors.map(mentor => {
                  const initials = getInitials(mentor.name);
                  const tags = mentor.expertise ? mentor.expertise.split(',').map(t => t.trim()).slice(0, 2) : [];
                  return (
                    <div key={mentor.id} className="mentor-card">
                      <div className="mentor-avatar">
                        {mentor.image ? (
                          <img
                            src={getGoogleDriveImageUrl(mentor.image)}
                            alt={mentor.name}
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                              const p = e.currentTarget.parentElement;
                              if (p) p.textContent = initials;
                            }}
                          />
                        ) : initials}
                      </div>
                      <div className="mentor-name">{mentor.name}</div>
                      <div className="mentor-role">{mentor.expertise}</div>
                      {tags.length > 0 && (
                        <div className="mentor-tags">
                          {tags.map(tag => <span key={tag} className="mentor-tag">{tag}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="mentor-loading" style={{ color: '#2a2a2a' }}>
                  {fetchError || 'No mentors available yet.'}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="mentors-nav">
                <button className="mentors-nav-btn" onClick={() => setMentorPage(p => Math.max(0, p - 1))} disabled={mentorPage === 0}>←</button>
                <button className="mentors-nav-btn" onClick={() => setMentorPage(p => Math.min(totalPages - 1, p + 1))} disabled={mentorPage === totalPages - 1}>→</button>
              </div>
            )}
          </div>
        </section>

        {/* ─── ABOUT ─── */}
        <section className="about-section scroll-reveal" id="about" data-delay="2">
          <div className="about-inner">
            <div className="about-eyebrow-row">
              <div className="about-eyebrow-text">About Connext</div>
              <div className="about-eyebrow-line" />
            </div>
            <div className="about-grid">
              <div className="about-card">
                <div className="about-card-num">01</div>
                <div className="about-card-tag">Mission</div>
                <div className="about-card-title">Why we exist</div>
                <p className="about-card-text">
                  To empower aspiring Malaysians to turn goals into reality through accessible, expert mentorship. We believe opportunity should be defined by potential — not background, colour, or postal code.
                </p>
              </div>
              <div className="about-card">
                <div className="about-card-num">02</div>
                <div className="about-card-tag">Vision</div>
                <div className="about-card-title">Where we&apos;re going</div>
                <p className="about-card-text">
                  A world where knowledge, experience, and opportunity flow freely between professionals across every industry. A future where mentorship is accessible to all, fostering innovation and growth everywhere.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <div className="scroll-reveal" data-delay="3">
          <div className="cta-section">
            <div className="cta-inner">
              <div className="cta-eyebrow">Start Today — It&apos;s Free</div>
              <h2 className="cta-title">Ready to<br /><em>grow?</em></h2>
              <p className="cta-sub">
                Join thousands of professionals who have already transformed their careers through expert mentorship on Connext.
              </p>
              <Link href="/signup" className="btn-cta">
                Start Your Journey <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <section className="faq-section scroll-reveal" id="faq" data-delay="4">
          <div className="faq-inner">
            <div className="faq-header">
              <div className="faq-eyebrow">Have Questions?</div>
              <h2 className="faq-title">FAQ</h2>
            </div>
            <div className="faq-list">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openFaqIndex === i;
                return (
                  <div key={i} className={`faq-item ${isOpen ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="faq-question-row"
                      onClick={() => setOpenFaqIndex(cur => cur === i ? null : i)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${i}`}
                    >
                      <div className="faq-question">{item.q}</div>
                      <div className="faq-icon" aria-hidden="true">+</div>
                    </button>
                    <div id={`faq-answer-${i}`} className="faq-answer" aria-hidden={!isOpen}>
                      {item.a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ─── FOOTER ─── */}
      <footer className="footer" id="contact">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <Link href="/" className="footer-logo">
                <img src="/logo.jpeg" alt="Connext logo" style={{ height: '26px', width: 'auto', display: 'block' }} />
              </Link>
              <p className="footer-tagline">
                Connecting mentors and mentees to build successful careers and lasting professional relationships.
              </p>
            </div>
            <div>
              <div className="footer-col-title">Platform</div>
              <ul className="footer-col-links">
                <li><Link href="/">Home</Link></li>
                <li><Link href="/mentee/mentor-listing">Find Mentors</Link></li>
                <li><Link href="/#about">About Us</Link></li>
                <li><Link href="/signup/mentor_secret">Become a Mentor</Link></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Contact</div>
              <ul className="footer-col-links">
                <li><a href="mailto:contact@connext.com">contact@connext.com</a></li>
                <li><a href="tel:+60123456789">+60 12-345 6789</a></li>
                <li>
                  <span className="footer-social" aria-label="Instagram coming soon">
                    <Instagram />
                    <span>Instagram</span>
                    <span className="footer-social-note">coming soon</span>
                  </span>
                </li>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© 2026 Connext. All rights reserved.</span>
            <span className="footer-badge">
              <span className="footer-badge-dot" />
              Malaysia&apos;s Mentor Platform
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}