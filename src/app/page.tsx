// page.tsx

'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { getGoogleDriveImageUrl } from '@/lib/utils';

interface FeaturedMentor {
  id: string | number;
  name: string;
  expertise: string;
  image: string;
  hint: string;
  institution_photo: { url: string; name: string }[];
}

export default function Home() {
  const [featuredMentors, setFeaturedMentors] = useState<FeaturedMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionPhotos, setInstitutionPhotos] = useState<{ url: string; name: string }[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mentorPage, setMentorPage] = useState(0);
  const [floatingNav, setFloatingNav] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const mentorsPerPage = 4;

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const response = await fetch('/api/mentors/featured');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (data.success && data.mentors && data.mentors.length > 0) {
          setFeaturedMentors(data.mentors);
          const allPhotos: { url: string; name: string }[] = [];
          data.mentors.forEach((mentor: FeaturedMentor) => {
            if (Array.isArray(mentor.institution_photo)) {
              mentor.institution_photo.forEach((photo) => {
                const url = typeof photo === 'string' ? photo : photo?.url;
                const name = typeof photo === 'string' ? 'Institution' : (photo?.name || 'Institution');
                if (url && url.trim()) allPhotos.push({ url: url.trim(), name });
              });
            }
          });
          const seen = new Set<string>();
          setInstitutionPhotos(allPhotos.filter(p => {
            if (seen.has(p.url)) return false;
            seen.add(p.url);
            return true;
          }));
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
    const handleScroll = () => {
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      setFloatingNav(heroBottom < 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const totalPages = Math.ceil(featuredMentors.length / mentorsPerPage);
  const visibleMentors = featuredMentors.slice(mentorPage * mentorsPerPage, mentorPage * mentorsPerPage + mentorsPerPage);
  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  const partnerFallbacks = ['UTM', 'UM', 'UPM', 'UKM', 'UiTM', 'MMU', 'UTAR', "Taylor's", 'Sunway', 'APU'];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --black:     #0A0A0A;
          --off-black: #141414;
          --charcoal:  #1E1E1E;
          --mid:       #6B6B6B;
          --border:    #E0E0E0;
          --surface:   #F7F7F5;
          --white:     #FFFFFF;
          --yellow:    #F5C518;
          --yellow-d:  #D4A30F;
          --yellow-l:  #FEF7D0;
          --yellow-xl: #FFFBEB;
        }

        html { scroll-behavior: smooth; }
        body {
          font-family: 'DM Sans', sans-serif;
          color: var(--black);
          background: var(--white);
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* ─── FLOATING NAV ─────────────────────────── */
        .floating-nav {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%) translateY(-10px);
          z-index: 1000;
          width: calc(100% - 48px);
          max-width: 1080px;
          background: rgba(10, 10, 10, 0.94);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 0 20px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .floating-nav.visible {
          opacity: 1;
          pointer-events: all;
          transform: translateX(-50%) translateY(0);
        }
        .floating-nav-logo {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          font-weight: 400;
          color: var(--white);
          text-decoration: none;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        .floating-nav-logo-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--yellow);
          display: inline-block;
        }
        .floating-nav-links {
          display: flex;
          align-items: center;
          gap: 2px;
          list-style: none;
        }
        .floating-nav-links button {
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 400;
          color: rgba(255,255,255,0.55);
          background: none;
          border: none;
          cursor: pointer;
          padding: 5px 12px;
          border-radius: 7px;
          transition: color 0.15s, background 0.15s;
        }
        .floating-nav-links button:hover {
          color: var(--white);
          background: rgba(255,255,255,0.07);
        }
        .floating-nav-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .fnav-signin {
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 400;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          padding: 6px 14px;
          border-radius: 7px;
          transition: color 0.15s, background 0.15s;
        }
        .fnav-signin:hover { color: var(--white); background: rgba(255,255,255,0.07); }
        .fnav-signup {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--black);
          text-decoration: none;
          padding: 7px 18px;
          border-radius: 8px;
          background: var(--yellow);
          transition: background 0.2s;
        }
        .fnav-signup:hover { background: var(--yellow-d); }

        /* ─── HERO SECTION ─────────────────────────── */
        .hero-section {
          background: var(--yellow-xl);
          position: relative;
          overflow: hidden;
        }
        .hero-section::before {
          content: '';
          position: absolute;
          top: -100px; right: -100px;
          width: 500px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(245,197,24,0.2) 0%, transparent 65%);
          pointer-events: none;
        }

        /* ─── HERO NAV ─────────────────────────────── */
        .hero-nav {
          position: relative;
          z-index: 10;
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 40px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hero-nav-logo {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          font-weight: 400;
          color: var(--black);
          text-decoration: none;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 7px;
          flex-shrink: 0;
        }
        .hero-nav-logo-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--yellow-d);
          display: inline-block;
        }
        .hero-nav-badge {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--yellow-d);
          background: rgba(212,163,15,0.12);
          border: 1px solid rgba(212,163,15,0.25);
          padding: 2px 8px;
          border-radius: 4px;
        }
        .hero-nav-links {
          display: flex;
          align-items: center;
          gap: 2px;
          list-style: none;
        }
        .hero-nav-links button {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 400;
          color: var(--charcoal);
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px 14px;
          border-radius: 7px;
          transition: color 0.15s, background 0.15s;
        }
        .hero-nav-links button:hover {
          color: var(--black);
          background: rgba(0,0,0,0.06);
        }
        .hero-nav-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .hero-nav-signin {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 400;
          color: var(--charcoal);
          text-decoration: none;
          padding: 7px 16px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.65);
          transition: all 0.15s;
        }
        .hero-nav-signin:hover {
          background: var(--white);
          color: var(--black);
          border-color: rgba(0,0,0,0.22);
        }
        .hero-nav-signup {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: var(--white);
          text-decoration: none;
          padding: 8px 20px;
          border-radius: 8px;
          background: var(--black);
          transition: background 0.2s;
        }
        .hero-nav-signup:hover { background: var(--charcoal); }
        .hero-mobile-toggle {
          display: none;
          background: rgba(255,255,255,0.65);
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 8px;
          width: 40px; height: 40px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-direction: column;
          gap: 4.5px;
          padding: 0;
        }
        .hero-mobile-toggle span {
          display: block;
          width: 18px; height: 1.5px;
          background: var(--black);
          border-radius: 1px;
          transition: all 0.22s;
        }
        .mobile-nav-panel {
          position: absolute;
          top: 76px; left: 16px; right: 16px;
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          z-index: 20;
          box-shadow: 0 8px 40px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .mobile-nav-panel button {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: var(--charcoal);
          background: none;
          border: none;
          cursor: pointer;
          padding: 11px 14px;
          border-radius: 8px;
          text-align: left;
          transition: background 0.15s;
        }
        .mobile-nav-panel button:hover { background: var(--surface); }
        .mobile-nav-divider { height: 1px; background: var(--border); margin: 6px 0; }
        .mobile-nav-cta { display: flex; gap: 8px; }
        .mobile-nav-cta a {
          flex: 1;
          text-align: center;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          padding: 10px;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.15s;
        }
        .m-signin { color: var(--charcoal); border: 1px solid var(--border); background: var(--white); }
        .m-signup { color: var(--white); background: var(--black); }

        /* ─── HERO CONTENT ─────────────────────────── */
        .hero-content {
          position: relative;
          z-index: 1;
          max-width: 1120px;
          margin: 0 auto;
          padding: 80px 40px 96px;
          text-align: center;
        }
        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--yellow-d);
          margin-bottom: 28px;
          animation: fadeUp 0.5s ease both;
        }
        .hero-eyebrow-line {
          width: 22px; height: 1.5px;
          background: var(--yellow-d);
          border-radius: 1px;
        }
        .hero-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(56px, 7.5vw, 96px);
          font-weight: 400;
          line-height: 1.0;
          letter-spacing: -0.03em;
          color: var(--black);
          margin-bottom: 24px;
          animation: fadeUp 0.5s 0.08s ease both;
        }
        .hero-title em {
          font-style: italic;
          position: relative;
          display: inline-block;
        }
        .hero-title em::after {
          content: '';
          position: absolute;
          left: 0; bottom: 5px;
          width: 100%; height: 10px;
          background: var(--yellow);
          z-index: -1;
          border-radius: 3px;
        }
        .hero-desc {
          font-size: 18px;
          line-height: 1.72;
          color: var(--mid);
          max-width: 460px;
          margin: 0 auto 40px;
          font-weight: 300;
          animation: fadeUp 0.5s 0.14s ease both;
        }
        .hero-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          animation: fadeUp 0.5s 0.2s ease both;
          margin-bottom: 72px;
        }
        .btn-primary {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 600;
          padding: 13px 28px;
          border-radius: 9px;
          border: none;
          background: var(--black);
          color: var(--white);
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          letter-spacing: -0.01em;
          transition: background 0.2s, transform 0.15s;
        }
        .btn-primary:hover { background: var(--charcoal); transform: translateY(-1px); }
        .btn-ghost {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 400;
          padding: 13px 24px;
          border-radius: 9px;
          border: 1.5px solid rgba(0,0,0,0.16);
          background: rgba(255,255,255,0.65);
          color: var(--charcoal);
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: border-color 0.2s, background 0.2s, color 0.2s;
        }
        .btn-ghost:hover { border-color: rgba(0,0,0,0.3); background: var(--white); color: var(--black); }

        /* ─── PARTNERS ─────────────────────────────── */
        .partners-wrap {
          animation: fadeUp 0.5s 0.26s ease both;
          max-width: 820px;
          margin: 0 auto;
        }
        .partners-label-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .partners-label-line { flex: 1; height: 1px; background: rgba(0,0,0,0.1); }
        .partners-label-text {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--mid);
          white-space: nowrap;
        }
        .partners-card {
          background: rgba(255,255,255,0.7);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(0,0,0,0.08);
        }
        .partners-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }
        .partner-cell {
          aspect-ratio: 3 / 1.3;
          background: var(--white);
          border-radius: 6px;
          border: 1px solid rgba(0,0,0,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          transition: border-color 0.2s, background 0.2s;
          overflow: hidden;
        }
        .partner-cell:hover { background: var(--yellow-xl); border-color: rgba(212,163,15,0.3); }
        .partner-cell img {
          max-width: 100%; max-height: 36px;
          object-fit: contain;
          opacity: 0.5;
          transition: opacity 0.2s;
        }
        .partner-cell:hover img { opacity: 1; }
        .partner-cell-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--mid);
          transition: color 0.2s;
        }
        .partner-cell:hover .partner-cell-text { color: var(--yellow-d); }

        /* ─── MENTORS ──────────────────────────────── */
        .mentors-section {
          padding: 100px 40px;
          background: var(--black);
          position: relative;
          overflow: hidden;
        }
        .mentors-section::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 5%, rgba(245,197,24,0.45) 50%, transparent 95%);
        }
        .mentors-inner { max-width: 1120px; margin: 0 auto; }
        .mentors-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 48px;
        }
        .mentors-eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #444;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mentors-eyebrow::after { content: ''; width: 22px; height: 1px; background: #222; }
        .mentors-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(36px, 4.5vw, 56px);
          font-weight: 400;
          line-height: 1.06;
          letter-spacing: -0.025em;
          color: var(--white);
        }
        .mentors-title em { font-style: italic; color: var(--yellow); }
        .mentors-subtitle {
          font-size: 14px;
          color: #484848;
          max-width: 260px;
          text-align: right;
          line-height: 1.75;
          font-weight: 300;
        }
        .mentors-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .mentor-card {
          background: #0e0e0e;
          border: 1px solid #1a1a1a;
          border-radius: 10px;
          padding: 22px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: border-color 0.25s, transform 0.2s;
          animation: fadeUp 0.5s ease both;
        }
        .mentor-card:nth-child(1){animation-delay:0.05s}
        .mentor-card:nth-child(2){animation-delay:0.1s}
        .mentor-card:nth-child(3){animation-delay:0.15s}
        .mentor-card:nth-child(4){animation-delay:0.2s}
        .mentor-card::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0; height: 2px;
          background: var(--yellow);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s;
        }
        .mentor-card:hover { border-color: #282828; transform: translateY(-2px); }
        .mentor-card:hover::after { transform: scaleX(1); }
        .mentor-avatar {
          width: 44px; height: 44px;
          border-radius: 8px;
          background: var(--yellow);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Serif Display', serif;
          font-size: 16px;
          color: var(--black);
          margin-bottom: 14px;
          overflow: hidden;
        }
        .mentor-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .mentor-name {
          font-size: 14.5px;
          font-weight: 500;
          color: var(--white);
          margin-bottom: 4px;
          letter-spacing: -0.01em;
        }
        .mentor-role {
          font-size: 12.5px;
          color: #484848;
          margin-bottom: 14px;
          line-height: 1.55;
          font-weight: 300;
        }
        .mentor-tags { display: flex; flex-wrap: wrap; gap: 5px; }
        .mentor-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 3px 8px;
          border: 1px solid #1e1e1e;
          color: #404040;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .mentor-card:hover .mentor-tag { border-color: rgba(245,197,24,0.25); color: #666; }
        .mentors-nav { display: flex; gap: 8px; margin-top: 32px; }
        .mentors-nav-btn {
          width: 40px; height: 40px;
          border-radius: 8px;
          border: 1px solid #1e1e1e;
          background: transparent;
          color: #444;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .mentors-nav-btn:hover:not(:disabled) { border-color: var(--yellow); color: var(--yellow); }
        .mentors-nav-btn:disabled { opacity: 0.22; cursor: not-allowed; }
        .mentor-loading {
          grid-column: 1 / -1;
          padding: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #333;
          font-size: 14px;
          font-weight: 300;
        }

        /* ─── ABOUT ────────────────────────────────── */
        .about-section { padding: 100px 40px; background: var(--white); }
        .about-inner { max-width: 1120px; margin: 0 auto; }
        .about-eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--mid);
          margin-bottom: 40px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .about-eyebrow::after { content: ''; width: 22px; height: 1px; background: var(--border); }
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .about-card {
          padding: 44px 40px;
          border: 1px solid var(--border);
          border-radius: 14px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s;
          background: var(--white);
        }
        .about-card:hover { border-color: rgba(0,0,0,0.2); }
        .about-card-num {
          font-family: 'DM Serif Display', serif;
          font-size: 72px;
          font-weight: 400;
          color: var(--surface);
          line-height: 1;
          margin-bottom: 4px;
          letter-spacing: -0.04em;
          transition: color 0.3s;
        }
        .about-card:hover .about-card-num { color: var(--yellow-l); }
        .about-card-tag {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--yellow-d);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .about-card-tag::before { content: ''; width: 12px; height: 2px; background: var(--yellow); border-radius: 1px; }
        .about-card-title {
          font-family: 'DM Serif Display', serif;
          font-size: 26px;
          font-weight: 400;
          letter-spacing: -0.02em;
          color: var(--black);
          margin-bottom: 14px;
          line-height: 1.15;
        }
        .about-card-text {
          font-size: 15px;
          color: var(--mid);
          line-height: 1.82;
          font-weight: 300;
        }

        /* ─── CTA ──────────────────────────────────── */
        .cta-section {
          padding: 120px 40px;
          background: var(--black);
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .cta-section::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 5%, rgba(245,197,24,0.45) 50%, transparent 95%);
        }
        .cta-glow {
          position: absolute;
          top: -60%; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 500px;
          background: radial-gradient(ellipse, rgba(245,197,24,0.09) 0%, transparent 65%);
          pointer-events: none;
        }
        .cta-inner { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; }
        .cta-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(44px, 5.5vw, 72px);
          font-weight: 400;
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: var(--white);
          margin-bottom: 18px;
        }
        .cta-title em { font-style: italic; color: var(--yellow); }
        .cta-sub {
          font-size: 16px;
          color: #484848;
          line-height: 1.78;
          margin-bottom: 36px;
          font-weight: 300;
        }
        .btn-cta {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 34px;
          border-radius: 9px;
          border: none;
          background: var(--yellow);
          color: var(--black);
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition: background 0.2s, transform 0.15s;
        }
        .btn-cta:hover { background: var(--yellow-d); transform: translateY(-1px); }

        /* ─── FOOTER ───────────────────────────────── */
        .footer { background: var(--black); padding: 64px 40px 40px; border-top: 1px solid #0e0e0e; }
        .footer-inner { max-width: 1120px; margin: 0 auto; }
        .footer-top {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 48px;
          margin-bottom: 52px;
        }
        .footer-logo {
          font-family: 'DM Serif Display', serif;
          font-size: 20px;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--white);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 14px;
        }
        .footer-logo-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--yellow);
          display: inline-block;
        }
        .footer-tagline {
          font-size: 13.5px;
          color: #3a3a3a;
          line-height: 1.72;
          max-width: 220px;
          font-weight: 300;
        }
        .footer-col-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--yellow);
          margin-bottom: 16px;
        }
        .footer-col-links { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .footer-col-links a {
          font-size: 13.5px;
          color: #3a3a3a;
          text-decoration: none;
          transition: color 0.15s;
          font-weight: 300;
        }
        .footer-col-links a:hover { color: var(--white); }
        .footer-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 28px;
          border-top: 1px solid #0e0e0e;
        }
        .footer-copy { font-size: 12.5px; color: #2a2a2a; font-weight: 300; }
        .footer-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 5px 12px;
          border: 1px solid #1a1a1a;
          color: #2a2a2a;
          border-radius: 100px;
        }
        .footer-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--yellow); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1024px) {
          .mentors-grid { grid-template-columns: 1fr 1fr; }
          .partners-grid { grid-template-columns: repeat(4, 1fr); }
          .footer-top { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 768px) {
          .hero-nav { padding: 22px 20px 0; }
          .hero-nav-links, .hero-nav-actions { display: none; }
          .hero-mobile-toggle { display: flex; }
          .hero-content { padding: 60px 20px 80px; }
          .partners-grid { grid-template-columns: repeat(3, 1fr); }
          .mentors-section { padding: 72px 20px; }
          .mentors-header { flex-direction: column; align-items: flex-start; gap: 14px; }
          .mentors-subtitle { text-align: left; max-width: 100%; }
          .about-section { padding: 72px 20px; }
          .about-grid { grid-template-columns: 1fr; }
          .cta-section { padding: 80px 20px; }
          .footer { padding: 48px 20px 32px; }
          .footer-top { grid-template-columns: 1fr; gap: 28px; }
          .footer-bottom { flex-direction: column; gap: 14px; text-align: center; }
          .floating-nav { width: calc(100% - 32px); }
          .floating-nav-links { display: none; }
        }
        @media (max-width: 520px) {
          .partners-grid { grid-template-columns: repeat(2, 1fr); }
          .mentors-grid { grid-template-columns: 1fr; }
          .hero-title { font-size: 50px; }
          .fnav-signin { display: none; }
        }
      `}</style>

      {/* ─── FLOATING NAV ───────────────────────────── */}
      <nav className={`floating-nav ${floatingNav ? 'visible' : ''}`} aria-label="Floating navigation">
        <Link href="/" className="floating-nav-logo">
          Connext<span className="floating-nav-logo-dot" />
        </Link>
        <ul className="floating-nav-links">
          <li><button onClick={() => scrollToSection('home')}>Home</button></li>
          <li><button onClick={() => scrollToSection('mentors')}>Mentors</button></li>
          <li><button onClick={() => scrollToSection('about')}>About</button></li>
          <li><button onClick={() => scrollToSection('contact')}>Contact</button></li>
        </ul>
        <div className="floating-nav-actions">
          <Link href="/login" className="fnav-signin">Sign In</Link>
          <Link href="/signup" className="fnav-signup">Get Started</Link>
        </div>
      </nav>

      {/* ─── HERO SECTION ───────────────────────────── */}
      <section className="hero-section" id="home" ref={heroRef}>
        <div style={{ position: 'relative' }}>
          <nav className="hero-nav" aria-label="Primary navigation">
            <Link href="/" className="hero-nav-logo">
              Connext
              <span className="hero-nav-logo-dot" />
              <span className="hero-nav-badge">Beta</span>
            </Link>
            <ul className="hero-nav-links">
              <li><button onClick={() => scrollToSection('home')}>Home</button></li>
              <li><button onClick={() => scrollToSection('mentors')}>Mentors</button></li>
              <li><button onClick={() => scrollToSection('about')}>About</button></li>
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
            Connect with experienced professionals, schedule sessions, and accelerate your career through expert mentorship.
          </p>

          <div className="hero-cta">
            <Link href="/signup" className="btn-primary">Get Started →</Link>
            <Link href="/login" className="btn-ghost">Sign In</Link>
          </div>

          <div className="partners-wrap">
            <div className="partners-label-row">
              <div className="partners-label-line" />
              <span className="partners-label-text">Trusted Partner Institutions</span>
              <div className="partners-label-line" />
            </div>
            <div className="partners-card">
              <div className="partners-grid">
                {institutionPhotos.length > 0
                  ? institutionPhotos.slice(0, 10).map((photo, idx) => (
                      <div key={idx} className="partner-cell">
                        <img
                          src={getGoogleDriveImageUrl(photo.url)}
                          alt={photo.name}
                          onError={(e) => {
                            const p = e.currentTarget.parentElement;
                            if (p) {
                              e.currentTarget.style.display = 'none';
                              const s = document.createElement('span');
                              s.className = 'partner-cell-text';
                              s.textContent = photo.name;
                              p.appendChild(s);
                            }
                          }}
                        />
                      </div>
                    ))
                  : partnerFallbacks.map(name => (
                      <div key={name} className="partner-cell">
                        <span className="partner-cell-text">{name}</span>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MENTORS ────────────────────────────────── */}
      <section className="mentors-section" id="mentors">
        <div className="mentors-inner">
          <div className="mentors-header">
            <div>
              <div className="mentors-eyebrow">Expert Mentors</div>
              <h2 className="mentors-title">Learn from<br /><em>industry leaders</em></h2>
            </div>
            <p className="mentors-subtitle">
              Connect with experienced professionals who are passionate about helping you succeed.
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
                        <img src={getGoogleDriveImageUrl(mentor.image)} alt={mentor.name}
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                            const p = e.currentTarget.parentElement;
                            if (p) p.textContent = initials;
                          }} />
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

      {/* ─── ABOUT ──────────────────────────────────── */}
      <section className="about-section" id="about">
        <div className="about-inner">
          <div className="about-eyebrow">About Connext</div>
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

      {/* ─── CTA ────────────────────────────────────── */}
      <section className="cta-section">
        <div className="cta-glow" />
        <div className="cta-inner">
          <h2 className="cta-title">Ready to<br /><em>grow?</em></h2>
          <p className="cta-sub">
            Join thousands of professionals who have already transformed their careers through expert mentorship on Connext.
          </p>
          <Link href="/signup" className="btn-cta">Start Your Journey →</Link>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────── */}
      <footer className="footer" id="contact">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <Link href="/" className="footer-logo">
                Connext<span className="footer-logo-dot" />
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
                <li><a href="tel:+1234567890">+1 (234) 567-890</a></li>
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