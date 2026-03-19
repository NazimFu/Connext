'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type Mentor } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2, Eye, Heart, Users, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import { getGoogleDriveImageUrl } from '@/lib/utils';

function MentorCard({
  mentor,
  isFavorited,
  onToggleFavorite,
  showRequestedBadge
}: {
  mentor: Mentor;
  isFavorited: boolean;
  onToggleFavorite: (mentorUID: string) => void;
  showRequestedBadge?: boolean;
}) {
  const router = useRouter();
  const [isFlipped, setIsFlipped] = useState(false);

  const handleCardClick = () => {
    setIsFlipped(!isFlipped);
  };

  const handleViewProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/mentee/mentor-listing/${mentor.id}`);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(mentor.mentorUID);
  };

  // Get available days from available_slots
  const getAvailableDays = () => {
    if (!mentor.available_slots || !Array.isArray(mentor.available_slots)) return [];
    return mentor.available_slots.map((slot: any) => slot.day).filter(Boolean);
  };

  const availableDays = getAvailableDays();

  // Fallback image handler
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = 'https://placehold.co/40x40/e5e7eb/6b7280?text=Logo';
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className="h-full relative z-0 hover:z-[10000]"
      style={{ perspective: '1000px' }}
    >
      <div
        className="relative w-full h-full cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
          minHeight: '380px' // slightly increased to accommodate larger avatar
        }}
        onClick={handleCardClick}
      >
        {/* Front of card */}
        <motion.div
          className="absolute w-full h-full"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }}
          animate={{
            rotateY: isFlipped ? 180 : 0,
            opacity: isFlipped ? 0 : 1
          }}
          transition={{ duration: 0.6 }}
        >
          <Card className="flex flex-col h-full transition-all duration-300 hover:shadow-xl hover:scale-105 border-0 shadow-md group overflow-visible bg-white rounded-2xl">
            {/* Heart Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              className="absolute top-3 right-3 z-10 hover:bg-red-100/80 transition-all rounded-full"
            >
              <Heart
                className={`h-5 w-5 transition-all ${
                  isFavorited
                    ? 'fill-red-500 text-red-500'
                    : 'text-gray-400 hover:text-red-500'
                }`}
              />
            </Button>

            {/* Previously Requested Badge */}
            {showRequestedBadge && (
              <div className="absolute top-3 left-3 z-10">
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-medium">
                  Previously Requested
                </Badge>
              </div>
            )}

            <CardHeader className="items-center text-center pb-4 bg-gradient-to-b from-gray-50 to-white">
              {/* ────────────────────────────────────────────────
                  Redesigned: Mentor Photo + Institutions Section
              ──────────────────────────────────────────────── */}
              <div className="flex flex-col items-center gap-5 mb-4 w-full">
                {/* Mentor Avatar – dominant focal point at the top */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/15 to-amber-500/15 rounded-full blur-xl opacity-70" />
                  <Avatar className="h-24 w-24 ring-3 ring-yellow-100 ring-offset-2 ring-offset-white transition-all duration-300 hover:ring-yellow-300 hover:scale-105 relative cursor-pointer shadow-md">
                    <AvatarImage src={getGoogleDriveImageUrl(mentor.mentor_photo)} />
                    <AvatarFallback className="bg-gradient-to-br from-yellow-500 to-amber-600 text-white text-2xl font-bold">
                      {mentor.mentor_name?.charAt(0).toUpperCase() || 'M'}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Mentor Name – below avatar */}
                <CardTitle className="font-headline text-lg font-bold text-gray-900 group-hover:text-yellow-700 transition-colors duration-200">
                  {mentor.mentor_name}
                </CardTitle>
              </div>

              {/* Specialization badges */}
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {Array.isArray(mentor.specialization) ? (
                  <>
                    {mentor.specialization.slice(0, 2).map((spec, idx) => (
                      <Badge
                        key={idx}
                        className="bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border-0 hover:from-yellow-200 hover:to-amber-200 text-xs font-medium px-3 py-1 rounded-full transition-all duration-200"
                      >
                        {spec}
                      </Badge>
                    ))}
                    {mentor.specialization.length > 2 && (
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-yellow-200 text-yellow-700 text-xs font-medium px-3 py-1 rounded-full cursor-help hover:bg-yellow-50 transition-all duration-200 bg-white">
                              +{mentor.specialization.length - 2}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white border border-gray-200 shadow-lg rounded-lg">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-gray-700">Other Specializations:</p>
                              <div className="flex flex-wrap gap-2 max-w-xs">
                                {mentor.specialization.slice(2).map((spec, idx) => (
                                  <Badge key={idx} className="bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border-0 text-xs font-medium rounded-full">
                                    {spec}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </>
                ) : (
                  <Badge className="bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border-0 text-xs font-medium px-3 py-1 rounded-full">
                    {mentor.specialization}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-grow px-6 py-3">
              <p className="text-sm text-center text-gray-600 line-clamp-2 leading-relaxed">
                {mentor.biography}
              </p>
            </CardContent>

            <CardFooter className="pt-3 pb-3 flex-col gap-2 border-t border-gray-100">
              {/* Institutions at bottom of card */}
              {mentor.institution_photo && Array.isArray(mentor.institution_photo) && mentor.institution_photo.length > 0 && (
                <div className="flex items-center justify-center gap-2.5 max-w-[260px] flex-wrap">
                  {mentor.institution_photo.slice(0, 3).map((photo, idx) => {
                    const photoObj = typeof photo === 'string' ? { url: photo, name: 'Institution' } : photo;
                    return (
                      <TooltipProvider key={`inst-${idx}`}>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="w-10 h-10 bg-white rounded-lg border border-gray-200/70 shadow-sm flex items-center justify-center p-1.5 transition-all duration-200 hover:border-yellow-300/60 hover:shadow-md hover:scale-110 cursor-pointer">
                              <img
                                src={getGoogleDriveImageUrl(photoObj.url)}
                                alt={photoObj.name}
                                className="max-w-[90%] max-h-[90%] object-contain"
                                onError={handleImageError}
                                loading="lazy"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-gray-900 text-white border-0 px-3 py-1.5">
                            <p className="text-xs font-medium">{photoObj.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}

                  {mentor.institution_photo.length > 3 && (
                    <TooltipProvider>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-help">
                            +{mentor.institution_photo.length - 3}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="top" 
                          align="center"
                          sideOffset={8}
                          className="bg-white border-gray-200 shadow-xl p-3 rounded-lg z-[9999] overflow-visible"
                          onPointerDownOutside={(e) => e.preventDefault()}
                        >
                          <p className="text-xs font-semibold text-gray-700 mb-2">Additional:</p>
                          <div className="grid grid-cols-3 gap-2.5 overflow-visible">
                            {mentor.institution_photo.slice(3).map((photo, i) => {
                              const photoObj = typeof photo === 'string' ? { url: photo, name: 'Institution' } : photo;
                              return (
                                <div 
                                  key={`tooltip-${i}`}
                                  className="w-11 h-11 bg-white rounded border border-gray-200 p-1.5 flex items-center justify-center cursor-pointer hover:border-yellow-300 transition-colors relative"
                                  onMouseEnter={(e) => {
                                    const tooltip = e.currentTarget.querySelector('.institution-tooltip') as HTMLElement;
                                    if (tooltip) tooltip.style.opacity = '1';
                                  }}
                                  onMouseLeave={(e) => {
                                    const tooltip = e.currentTarget.querySelector('.institution-tooltip') as HTMLElement;
                                    if (tooltip) tooltip.style.opacity = '0';
                                  }}
                                >
                                  <img
                                    src={getGoogleDriveImageUrl(photoObj.url)}
                                    alt="Institution logo"
                                    className="max-w-full max-h-full object-contain"
                                    onError={handleImageError}
                                    loading="lazy"
                                  />
                                  <div className="institution-tooltip absolute -top-9 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-[10001] transition-opacity duration-200" style={{ opacity: 0 }}>
                                    {photoObj.name}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </CardFooter>
          </Card>
        </motion.div>

        {/* Back of card – unchanged */}
        <motion.div
          className="absolute w-full h-full"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
          animate={{
            rotateY: isFlipped ? 0 : -180,
            opacity: isFlipped ? 1 : 0
          }}
          transition={{ duration: 0.6 }}
        >
          <Card className="flex flex-col h-full bg-gradient-to-br from-white via-gray-50 to-yellow-50 border-0 shadow-md rounded-2xl overflow-visible">
            <CardHeader className="items-center text-center pb-3 bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 text-white">
              <CardTitle className="font-headline text-lg font-bold">
                {mentor.mentor_name}
              </CardTitle>
              <p className="text-xs opacity-95 mt-1.5 font-medium">📅 Availability</p>
            </CardHeader>
            <CardContent className="flex-grow px-6 py-4 space-y-4">
              {availableDays.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-2.5 uppercase tracking-wide">Available Days</h4>
                  <div className="flex flex-wrap gap-2">
                    {availableDays.map((day, idx) => (
                      <Badge key={idx} className="text-xs bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-0 font-medium rounded-full px-3 py-1">
                        {day}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {mentor.field_of_consultation && Array.isArray(mentor.field_of_consultation) && mentor.field_of_consultation.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-2.5 uppercase tracking-wide">Consultation Areas</h4>
                  <div className="flex flex-wrap gap-2">
                    {mentor.field_of_consultation.slice(0, 2).map((field, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 font-medium rounded-full px-3 py-1">
                        {field}
                      </Badge>
                    ))}
                    {mentor.field_of_consultation.length > 2 && (
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 cursor-help hover:bg-amber-50 bg-white font-medium rounded-full px-3 py-1 transition-all">
                              +{mentor.field_of_consultation.length - 2} more
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white border border-gray-200 shadow-lg rounded-lg">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-gray-700">Other Consultation Areas:</p>
                              <div className="flex flex-wrap gap-2 max-w-xs">
                                {mentor.field_of_consultation.slice(2).map((field, idx) => (
                                  <Badge key={idx} className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 text-xs font-medium rounded-full">
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-3 pb-4 flex-col gap-3 border-t border-amber-200/50">
              <Button
                onClick={handleViewProfile}
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <Eye className="mr-2 h-4 w-4" />
                View Full Profile
              </Button>
              <div className="text-xs text-center text-gray-500 font-medium">
                ✨ Click to flip back
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────
// The rest of the component (MentorsPage) remains unchanged
// ────────────────────────────────────────────────

export default function MentorsPage() {
  const { user } = useAuth();
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);
  const [availableFilters, setAvailableFilters] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableInstitutions, setAvailableInstitutions] = useState<string[]>([]);
  const [favoriteMentors, setFavoriteMentors] = useState<string[]>([]);
  const [requestedMentors, setRequestedMentors] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRequested, setShowRequested] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<'specialization' | 'availability' | 'institution'>('specialization');

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const response = await fetch('/api/mentors');
        if (!response.ok) throw new Error('Failed to fetch mentors');
        const data = await response.json();
        setMentors(data);

        const allSpecializations = new Set<string>();
        const allDays = new Set<string>();
        const institutionSet = new Set<string>();

        data.forEach((mentor: Mentor) => {
          if (Array.isArray(mentor.specialization)) {
            mentor.specialization.forEach((spec) => allSpecializations.add(spec));
          } else if (mentor.specialization) {
            allSpecializations.add(mentor.specialization);
          }

          if (mentor.available_slots && Array.isArray(mentor.available_slots)) {
            mentor.available_slots.forEach((slot: any) => {
              if (slot.day) allDays.add(slot.day);
            });
          }

          // Extract institution names
          if (mentor.institution_photo && Array.isArray(mentor.institution_photo)) {
            mentor.institution_photo.forEach((photo) => {
              if (typeof photo === 'object' && photo.name) {
                institutionSet.add(photo.name);
              }
            });
          }
        });

        setAvailableFilters(Array.from(allSpecializations).sort());

        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const sortedDays = Array.from(allDays).sort((a, b) =>
          dayOrder.indexOf(a) - dayOrder.indexOf(b)
        );
        setAvailableDays(sortedDays);
        setAvailableInstitutions(Array.from(institutionSet).sort());
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMentors();
  }, []);

  useEffect(() => {
    const fetchFavorites = async () => {
      if (!user?.id) return;

      try {
        await fetch('/api/mentee/sync-requested', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });

        const response = await fetch(`/api/mentee/favorites?userId=${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setFavoriteMentors(data.favorite_mentors || []);
          setRequestedMentors(data.requested_mentors || []);
        }
      } catch (error) {
        console.error('Error fetching favorites:', error);
      }
    };

    fetchFavorites();
  }, [user?.id]);

  const toggleFavorite = async (mentorUID: string) => {
    if (!user?.id) return;
    try {
      const response = await fetch('/api/mentee/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, mentorUID }),
      });
      if (response.ok) {
        const data = await response.json();
        setFavoriteMentors(data.favorite_mentors);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters(prev =>
      prev.includes(filter)
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const toggleInstitution = (institution: string) => {
    setSelectedInstitutions(prev =>
      prev.includes(institution)
        ? prev.filter(i => i !== institution)
        : [...prev, institution]
    );
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
    setSelectedDays([]);
    setSelectedInstitutions([]);
    setSearchQuery('');
    setShowFavorites(false);
    setShowRequested(false);
  };

  const filteredMentors = mentors.filter((mentor) => {
    const searchFields = [
      mentor.mentor_name,
      mentor.biography,
      ...(Array.isArray(mentor.specialization) ? mentor.specialization : [mentor.specialization || ''])
    ];
    const matchesSearch = searchFields.some(field =>
      field?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const matchesFilters = selectedFilters.length === 0 || selectedFilters.some(filter => {
      if (Array.isArray(mentor.specialization)) {
        return mentor.specialization.includes(filter);
      }
      return mentor.specialization === filter;
    });

    const matchesDays = selectedDays.length === 0 || selectedDays.some(day => {
      if (mentor.available_slots && Array.isArray(mentor.available_slots)) {
        return mentor.available_slots.some((slot: any) => slot.day === day);
      }
      return false;
    });

    const matchesInstitutions = selectedInstitutions.length === 0 || selectedInstitutions.some(institution => {
      if (mentor.institution_photo && Array.isArray(mentor.institution_photo)) {
        return mentor.institution_photo.some((photo) => {
          if (typeof photo === 'object' && photo.name) {
            return photo.name === institution;
          }
          return false;
        });
      }
      return false;
    });

    const matchesFavorites = !showFavorites || favoriteMentors.includes(mentor.mentorUID);
    const matchesRequested = !showRequested || requestedMentors.includes(mentor.mentorUID);

    return matchesSearch && matchesFilters && matchesDays && matchesInstitutions && matchesFavorites && matchesRequested;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg">
            Find Your Mentor
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="p-6"
          >
            {/* Search and Filters – unchanged */}
            <div className="bg-white rounded-xl border border-gray-400 shadow-sm p-6 mb-8">
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input
                    placeholder="Search by name, expertise, specialization..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-gray-100"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-300">
                  <Button
                    variant={showFavorites ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowFavorites(!showFavorites);
                      setShowRequested(false);
                    }}
                    className={`text-xs ${
                      showFavorites
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
                        : 'border-gray-400 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Heart className={`h-3 w-3 mr-1.5 ${showFavorites ? 'fill-white' : ''}`} />
                    Favorites {favoriteMentors.length > 0 && `(${favoriteMentors.length})`}
                  </Button>
                  <Button
                    variant={showRequested ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowRequested(!showRequested);
                      setShowFavorites(false);
                    }}
                    className={`text-xs ${
                      showRequested
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                        : 'border-gray-400 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Previously Requested {requestedMentors.length > 0 && `(${requestedMentors.length})`}
                  </Button>
                </div>

                <div className="pt-1">
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-900 shrink-0">Filter By:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={activeFilterTab === 'institution' ? 'default' : 'outline'}
                        onClick={() => setActiveFilterTab('institution')}
                        className={activeFilterTab === 'institution' ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white h-8' : 'h-8 border-purple-300 text-purple-700 hover:bg-purple-50'}
                      >
                        Institution
                        {selectedInstitutions.length > 0 && (
                          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">
                            {selectedInstitutions.length}
                          </span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeFilterTab === 'specialization' ? 'default' : 'outline'}
                        onClick={() => setActiveFilterTab('specialization')}
                        className={activeFilterTab === 'specialization' ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white h-8' : 'h-8 border-blue-300 text-blue-700 hover:bg-blue-50'}
                      >
                        Specialization
                        {selectedFilters.length > 0 && (
                          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">
                            {selectedFilters.length}
                          </span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeFilterTab === 'availability' ? 'default' : 'outline'}
                        onClick={() => setActiveFilterTab('availability')}
                        className={activeFilterTab === 'availability' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white h-8' : 'h-8 border-green-300 text-green-700 hover:bg-green-50'}
                      >
                        Availability
                        {selectedDays.length > 0 && (
                          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">
                            {selectedDays.length}
                          </span>
                        )}
                      </Button>
                    </div>
                    {(selectedFilters.length > 0 || selectedDays.length > 0 || selectedInstitutions.length > 0 || searchQuery || showFavorites || showRequested) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="md:ml-auto text-xs text-gray-700 hover:text-gray-800 hover:bg-gray-100 h-7"
                      >
                        Clear All
                      </Button>
                    )}
                  </div>

                  {activeFilterTab === 'specialization' && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {availableFilters.map((filter) => (
                          <Badge
                            key={filter}
                            onClick={() => toggleFilter(filter)}
                            className={`cursor-pointer transition-all text-xs ${
                              selectedFilters.includes(filter)
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                                : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            {filter}
                            {selectedFilters.includes(filter) && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>
                      {selectedFilters.length > 0 && (
                        <div className="mt-3 text-xs text-gray-600">
                          Showing mentors with: <span className="font-semibold text-gray-700">{selectedFilters.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {activeFilterTab === 'availability' && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {availableDays.map((day) => (
                          <Badge
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={`cursor-pointer transition-all text-xs ${
                              selectedDays.includes(day)
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700'
                                : 'bg-green-50 text-green-800 border-green-300 hover:bg-green-100'
                            }`}
                          >
                            {day}
                            {selectedDays.includes(day) && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>
                      {selectedDays.length > 0 && (
                        <div className="mt-3 text-xs text-gray-600">
                          Available on: <span className="font-semibold text-gray-700">{selectedDays.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {activeFilterTab === 'institution' && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {availableInstitutions.map((institution) => (
                          <Badge
                            key={institution}
                            onClick={() => toggleInstitution(institution)}
                            className={`cursor-pointer transition-all text-xs ${
                              selectedInstitutions.includes(institution)
                                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700'
                                : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                            }`}
                          >
                            {institution}
                            {selectedInstitutions.includes(institution) && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>
                      {selectedInstitutions.length > 0 && (
                        <div className="mt-3 text-xs text-gray-600">
                          From institutions: <span className="font-semibold text-gray-700">{selectedInstitutions.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredMentors.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No mentors found</h3>
                <p className="text-gray-600 mb-4">Try adjusting your search or filters</p>
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  className="border-gray-400 text-gray-700 hover:bg-gray-100"
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div>
                <div className="mb-4 text-sm text-gray-600">
                  Found <span className="font-semibold text-gray-900">{filteredMentors.length}</span> mentor{filteredMentors.length !== 1 ? 's' : ''}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {filteredMentors.map((mentor) => (
                      <MentorCard
                        key={mentor.id}
                        mentor={mentor}
                        isFavorited={favoriteMentors.includes(mentor.mentorUID)}
                        onToggleFavorite={toggleFavorite}
                        showRequestedBadge={requestedMentors.includes(mentor.mentorUID)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}