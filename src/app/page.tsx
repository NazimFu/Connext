'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useEffect, useRef, useState } from 'react';
import AutoScroll from 'embla-carousel-auto-scroll';
import { Flag, Eye } from 'lucide-react';
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
  const plugin = useRef(
    AutoScroll({
      speed: 1.5,
      startDelay: 0,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
      stopOnFocusIn: false,
    })
  );

  const [featuredMentors, setFeaturedMentors] = useState<FeaturedMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionPhotos, setInstitutionPhotos] = useState<string[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const response = await fetch('/api/mentors/featured');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        if (data.success && data.mentors && data.mentors.length > 0) {
          setFeaturedMentors(data.mentors);

          // Extract institution photos — API now always returns {url, name} objects
          const allPhotos: string[] = [];
          data.mentors.forEach((mentor: FeaturedMentor) => {
            if (Array.isArray(mentor.institution_photo)) {
              mentor.institution_photo.forEach((photo) => {
                const url = typeof photo === 'string' ? photo : photo?.url;
                if (url && url.trim()) {
                  allPhotos.push(url.trim());
                }
              });
            }
          });

          const uniquePhotos = [...new Set(allPhotos)];
          const convertedPhotos = uniquePhotos
            .map((url) => getGoogleDriveImageUrl(url))
            .filter(Boolean);

          setInstitutionPhotos(convertedPhotos);
        } else {
          setFetchError(data.message || 'No mentors found');
        }
      } catch (error) {
        console.error('Error fetching mentors:', error);
        setFetchError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setLoading(false);
        setLoadingInstitutions(false);
      }
    };

    fetchMentors();
  }, []);

  return (
    <div
      className="flex flex-col min-h-screen overflow-x-hidden text-foreground"
      style={{
        background:
          'linear-gradient(180deg, hsl(48 100% 96%) 0%, hsl(0 0% 100%) 30%, hsl(48 100% 98%) 60%, hsl(0 0% 100%) 80%, hsl(48 100% 97%) 100%)',
      }}
    >
      {/* Hero Section */}
      <section id="home" className="w-full pt-36 md:pt-48 lg:pt-56 pb-24 md:pb-36 lg:pb-40">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-[1.5fr,1fr] gap-10 lg:gap-16 items-start">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl xl:text-6xl/none font-headline mb-12">
                Unlock Your Potential with Expert Mentorship
              </h1>
            </div>
            <div className="space-y-10">
              <p className="text-lg md:text-xl leading-relaxed text-muted-foreground">
                Connect with experienced professionals, schedule meetings, and accelerate your
                career growth.
              </p>
              <div className="flex">
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 font-semibold shadow-lg hover:shadow-yellow-600/40 transition-all"
                >
                  <Link href="/signup">Get Started</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section id="about" className="w-full py-8 md:py-12 scroll-mt-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="group relative overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:shadow-lg bg-white/60 backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-border/40"></div>
              <CardHeader className="space-y-4 pb-3">
                <div className="inline-flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-500 text-white shadow-md group-hover:scale-105 transition-transform">
                    <Flag className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold font-headline">Our Mission</CardTitle>
                </div>
                <div className="h-1 w-20 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 group-hover:w-28 transition-all" />
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  To empower aspiring Malaysians to turn goals into reality through accessible,
                  expert mentorship.
                </p>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:shadow-lg bg-white/60 backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-border/40"></div>
              <CardHeader className="space-y-4 pb-3">
                <div className="inline-flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-400 text-white shadow-md group-hover:scale-105 transition-transform">
                    <Eye className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold font-headline">Our Vision</CardTitle>
                </div>
                <div className="h-1 w-20 rounded-full bg-gradient-to-r from-yellow-500 to-yellow-400 group-hover:w-28 transition-all" />
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  A world where opportunity is defined by potential, not by background, colors, or
                  postal code.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Meet Our Mentors */}
      <section id="mentors" className="w-full py-8 md:py-16 lg:py-20 scroll-mt-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">
                Meet Our Mentors
              </h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Our mentors are industry leaders and experts in their fields, ready to guide you.
              </p>
            </div>
          </div>

          <div className="pt-12">
            {loading ? (
              <div className="flex justify-center items-center min-h-[300px]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading mentors...</p>
                </div>
              </div>
            ) : featuredMentors.length === 0 ? (
              <div className="flex justify-center items-center min-h-[300px]">
                <div className="text-center space-y-3">
                  <p className="text-muted-foreground">No mentors available yet.</p>
                  {fetchError && (
                    <p className="text-xs text-muted-foreground/60">({fetchError})</p>
                  )}
                </div>
              </div>
            ) : (
              <Carousel
                plugins={[plugin.current]}
                className="w-full max-w-7xl mx-auto"
                onMouseEnter={() => plugin.current && plugin.current.stop()}
                onMouseLeave={() => plugin.current && plugin.current.play()}
                opts={{ align: 'start', loop: true, dragFree: true }}
              >
                <CarouselContent className="py-6">
                  {featuredMentors.map((mentor) => (
                    <CarouselItem
                      key={mentor.id}
                      className="pl-2 md:pl-4 py-2 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
                    >
                      <Card className="border-2 hover:border-yellow-400 bg-white/70 backdrop-blur-sm hover:shadow-lg transition-all">
                        <CardHeader className="flex-shrink-0 pb-2">
                          <Avatar className="mx-auto h-24 w-24 mb-4 ring-2 ring-yellow-400/40">
                            <AvatarImage
                              src={getGoogleDriveImageUrl(mentor.image)}
                              data-ai-hint={mentor.hint}
                            />
                            <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-white">
                              {mentor.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <CardTitle className="font-headline text-lg leading-tight min-h-[3rem] flex items-center justify-center">
                            {mentor.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow flex items-start justify-center pt-0">
                          <p className="text-sm text-muted-foreground leading-relaxed min-h-[2.5rem] flex items-center justify-center text-center">
                            {mentor.expertise}
                          </p>
                        </CardContent>
                      </Card>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            )}
          </div>
        </div>
      </section>

      {/* Partner Institutions */}
      <section className="w-full py-8 md:py-12">
        <div className="container mx-auto px-4 md:px-6">
          <h3 className="text-center text-sm md:text-base uppercase tracking-wider font-semibold mb-6">
            Our Partner Institutions
          </h3>

          {loadingInstitutions ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 max-w-5xl mx-auto">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 md:h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : institutionPhotos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No institution photos available yet</p>
              <p className="text-xs mt-1">Mentors can add institution logos in their profile settings</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 max-w-5xl mx-auto">
              {institutionPhotos.map((src, idx) => (
                <div
                  key={`institution-${idx}`}
                  className="relative group rounded-md border border-gray-200 hover:border-yellow-400 transition-all overflow-hidden bg-white shadow-sm hover:shadow-md"
                >
                  <div className="aspect-[3/2] flex items-center justify-center p-2">
                    <img
                      src={src}
                      alt={`Partner Institution ${idx + 1}`}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src =
                          'https://placehold.co/120x60/e5e7eb/6b7280?text=Logo';
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="w-full py-6 md:py-8 bg-gray-900 text-white scroll-mt-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <h3 className="text-2xl font-bold font-headline mb-2 bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent">
                CONNEXT
              </h3>
              <p className="text-gray-400 text-sm">Connecting mentors and mentees</p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-4">
              <h4 className="font-semibold text-lg">Get in Touch</h4>
              <div className="flex flex-wrap justify-center md:justify-end gap-6 text-sm">
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-yellow-400 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                  LinkedIn
                </a>
                <a
                  href="mailto:contact@connext.com"
                  className="hover:text-yellow-400 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M0 3v18h24v-18h-24zm6.623 7.929l-4.623 5.712v-9.458l4.623 3.746zm-4.141-5.929h19.035l-9.517 7.713-9.518-7.713zm5.694 7.188l3.824 3.099 3.83-3.104 5.612 6.817h-18.779l5.513-6.812zm9.208-1.264l4.616-3.741v9.348l-4.616-5.607z" />
                  </svg>
                  contact@connext.com
                </a>
                <a
                  href="tel:+1234567890"
                  className="hover:text-yellow-400 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                  +1 (234) 567-890
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-6 text-center text-gray-400 text-sm">
            <p>&copy; 2025 CONNEXT. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}