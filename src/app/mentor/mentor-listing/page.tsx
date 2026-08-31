'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2, Eye, Heart, MessageCircle, ChevronDown, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getGoogleDriveImageUrl } from '@/lib/utils';

interface Mentor {
  id: string;
  mentorUID: string;
  mentor_name: string;
  mentor_email: string;
  mentor_photo: string;
  institution_photo: (string | { url: string; name: string })[];
  specialization: string[];
  field_of_consultation: string[];
  biography: string;
  experience: string[];
  skills: string[];
  achievement: string[];
  available_slots: Array<{
    day: string;
    time: string[];
  }>;
  role?: string;
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClose,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const filtered = [...options]
    .filter(o => o.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="h-7 pl-7 text-xs border-gray-200 focus:border-gray-400"
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 px-3 py-2 text-center">No results found</p>
        ) : (
          filtered.map(option => (
            <button
              key={option}
              onClick={() => onToggle(option)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left rounded-md hover:bg-gray-50 transition-colors text-gray-700"
            >
              <div className={`w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-colors ${
                selected.includes(option) ? 'bg-gray-900 border-gray-900' : 'border-gray-300 bg-white'
              }`}>
                {selected.includes(option) && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <span className={selected.includes(option) ? 'font-medium text-gray-900' : ''}>
                {option}
              </span>
            </button>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <div className="p-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">{selected.length} selected</p>
        </div>
      )}
    </div>
  );
}

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
    router.push(`/mentor/mentor-listing/${mentor.id}`);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(mentor.mentorUID);
  };

  const getAvailableDays = () => {
    if (!mentor.available_slots || !Array.isArray(mentor.available_slots)) return [];
    return mentor.available_slots.map((slot: any) => slot.day).filter(Boolean);
  };

  const availableDays = getAvailableDays();

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
          minHeight: '350px'
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
          <Card className="flex flex-col h-full transition-all hover:shadow-lg border-l-4 border-l-yellow-400 hover:border-l-amber-500 group overflow-visible">
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

            {showRequestedBadge && (
              <div className="absolute top-3 left-3 z-10">
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-medium">
                  Previously Met
                </Badge>
              </div>
            )}

            <CardHeader className="items-center text-center pb-3">
              <div className="relative mb-3">
                <Avatar className="h-20 w-20 ring-4 ring-yellow-100 transition-all group-hover:ring-yellow-200 group-hover:scale-105">
                  <AvatarImage src={getGoogleDriveImageUrl(mentor.mentor_photo)} />
                  <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-amber-500 text-white text-xl font-bold">
                    {mentor.mentor_name?.charAt(0).toUpperCase() || 'M'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="font-headline text-base group-hover:text-yellow-700 transition-colors">
                {mentor.mentor_name}
              </CardTitle>

              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {Array.isArray(mentor.specialization) ? (
                  <>
                    {mentor.specialization.slice(0, 2).map((spec, idx) => (
                      <Badge
                        key={idx}
                        className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200 text-xs px-2 py-0.5"
                      >
                        {spec}
                      </Badge>
                    ))}
                    {mentor.specialization.length > 2 && (
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-yellow-300 text-yellow-700 text-xs px-2 py-0.5 cursor-help hover:bg-yellow-50">
                              +{mentor.specialization.length - 2}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white border-yellow-200 shadow-lg">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Other Specializations:</p>
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {mentor.specialization.slice(2).map((spec, idx) => (
                                  <Badge key={idx} className="bg-yellow-100 text-yellow-800 text-xs">
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
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs px-2 py-0.5">
                    {mentor.specialization}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-grow px-6 py-2">
              <p className="text-sm text-center text-muted-foreground line-clamp-2 leading-relaxed">
                {mentor.biography}
              </p>
            </CardContent>

            <CardFooter className="pt-3 pb-3 flex-col gap-2 border-t border-gray-100">
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
                                onError={(e) => {
                                  e.currentTarget.src = 'https://placehold.co/40x40/e5e7eb/6b7280?text=Logo';
                                }}
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
                                    onError={(e) => {
                                      e.currentTarget.src = 'https://placehold.co/40x40/e5e7eb/6b7280?text=Logo';
                                    }}
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

        {/* Back of card */}
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
          <Card className="flex flex-col h-full bg-gradient-to-br from-yellow-50 to-amber-50 border-l-4 border-l-amber-500 overflow-hidden">
            <CardHeader className="items-center text-center pb-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-white">
              <CardTitle className="font-headline text-base">
                {mentor.mentor_name}
              </CardTitle>
              <p className="text-xs opacity-90 mt-1">Availability</p>
            </CardHeader>

            <CardContent className="flex-grow px-6 py-4 space-y-3">
              {availableDays.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">📅 Available Days:</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {availableDays.map((day, idx) => (
                      <Badge key={idx} className="text-xs bg-green-100 text-green-800 border-green-200">
                        {day}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {mentor.field_of_consultation && Array.isArray(mentor.field_of_consultation) && mentor.field_of_consultation.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">💼 Consultation:</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {mentor.field_of_consultation.slice(0, 2).map((field, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs border-amber-300 text-amber-800">
                        {field}
                      </Badge>
                    ))}
                    {mentor.field_of_consultation.length > 2 && (
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 cursor-help hover:bg-amber-50">
                              +{mentor.field_of_consultation.length - 2} more
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white border-amber-200 shadow-lg">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Other Consultation Areas:</p>
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {mentor.field_of_consultation.slice(2).map((field, idx) => (
                                  <Badge key={idx} className="bg-amber-100 text-amber-800 text-xs">
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

            <CardFooter className="pt-2 pb-4 flex-col gap-2">
              <Button
                onClick={handleViewProfile}
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white text-sm"
              >
                <Eye className="mr-2 h-4 w-4" />
                View Full Profile
              </Button>
              <div className="text-xs text-center text-gray-600">
                👆 Click to flip back
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function MentorsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
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
  const [openFilterPopup, setOpenFilterPopup] = useState<'specialization' | 'availability' | 'institution' | null>(null);

  useEffect(() => {
    const fetchMentors = async () => {
      if (!user?.id) return;

      try {
        const response = await fetch('/api/mentors');
        if (!response.ok) {
          throw new Error('Failed to fetch mentors');
        }
        const data = await response.json();

        const otherMentors = data.filter((mentor: Mentor) => mentor.mentorUID !== user.id);
        setMentors(otherMentors);

        const allSpecializations = new Set<string>();
        const allDays = new Set<string>();
        otherMentors.forEach((mentor: Mentor) => {
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
        });
        setAvailableFilters(Array.from(allSpecializations).sort());

        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const sortedDays = Array.from(allDays).sort((a, b) =>
          dayOrder.indexOf(a) - dayOrder.indexOf(b)
        );
        setAvailableDays(sortedDays);

        const institutionSet = new Set<string>();
        otherMentors.forEach((mentor: Mentor) => {
          if (mentor.institution_photo && Array.isArray(mentor.institution_photo)) {
            mentor.institution_photo.forEach((photo) => {
              const institutionName = typeof photo === 'string' ? 'Institution' : photo.name;
              if (institutionName && institutionName !== 'Institution') {
                institutionSet.add(institutionName);
              }
            });
          }
        });
        setAvailableInstitutions(Array.from(institutionSet).sort());
      } catch (error) {
        console.error('Error fetching mentors:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to fetch mentors. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMentors();
  }, [user?.id, toast]);

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
      ...(Array.isArray(mentor.specialization) ? mentor.specialization : [mentor.specialization])
    ];
    const matchesSearch = searchFields.some((field) =>
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
          const institutionName = typeof photo === 'string' ? 'Institution' : photo.name;
          return institutionName === institution;
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold">
            Connect with Fellow Mentors
          </div>
          <motion.div
            className="p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >

          {/* Search and Filters */}
          <div className="bg-white rounded-2xl border border-yellow-100/50 shadow-lg p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-yellow-600" />
                <Input
                  placeholder="Search by name, expertise, specialization..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-yellow-200 focus:border-yellow-400 focus:ring-yellow-400/20"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-yellow-50"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Filter Section */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 shrink-0">Filter By:</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowFavorites(!showFavorites);
                    setShowRequested(false);
                  }}
                  className={`h-8 text-xs min-w-[130px] transition-colors ${
                    showFavorites
                      ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                      : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                  }`}
                >
                  <Heart className={`h-3 w-3 mr-1.5 transition-all ${showFavorites ? 'fill-yellow-700 text-yellow-700' : ''}`} />
                  Favorited Mentors {favoriteMentors.length > 0 && `(${favoriteMentors.length})`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRequested(!showRequested);
                    setShowFavorites(false);
                  }}
                  className={`h-8 text-xs min-w-[130px] transition-colors ${
                    showRequested
                      ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                      : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                  }`}
                >
                  <MessageCircle className={`h-3 w-3 mr-1.5 transition-all ${showRequested ? 'fill-yellow-700 text-yellow-700' : ''}`} />
                  Previously Met {requestedMentors.length > 0 && `(${requestedMentors.length})`}
                </Button>
                <div className="h-5 w-px bg-yellow-200 mx-1" />
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenFilterPopup(openFilterPopup === 'institution' ? null : 'institution')}
                    className={`h-8 min-w-[115px] transition-colors ${
                      (openFilterPopup === 'institution' || selectedInstitutions.length > 0)
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                        : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                    }`}
                  >
                    Institution
                    {selectedInstitutions.length > 0 && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-600 text-white px-1.5 text-[11px] font-semibold">
                        {selectedInstitutions.length}
                      </span>
                    )}
                    <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${openFilterPopup === 'institution' ? 'rotate-180' : ''}`} />
                  </Button>
                  {openFilterPopup === 'institution' && (
                    <FilterDropdown
                      label="Institution"
                      options={availableInstitutions}
                      selected={selectedInstitutions}
                      onToggle={toggleInstitution}
                      onClose={() => setOpenFilterPopup(null)}
                    />
                  )}
                </div>
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenFilterPopup(openFilterPopup === 'specialization' ? null : 'specialization')}
                    className={`h-8 min-w-[115px] transition-colors ${
                      (openFilterPopup === 'specialization' || selectedFilters.length > 0)
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                        : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                    }`}
                  >
                    Specialization
                    {selectedFilters.length > 0 && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-600 text-white px-1.5 text-[11px] font-semibold">
                        {selectedFilters.length}
                      </span>
                    )}
                    <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${openFilterPopup === 'specialization' ? 'rotate-180' : ''}`} />
                  </Button>
                  {openFilterPopup === 'specialization' && (
                    <FilterDropdown
                      label="Specialization"
                      options={availableFilters}
                      selected={selectedFilters}
                      onToggle={toggleFilter}
                      onClose={() => setOpenFilterPopup(null)}
                    />
                  )}
                </div>
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenFilterPopup(openFilterPopup === 'availability' ? null : 'availability')}
                    className={`h-8 min-w-[115px] transition-colors ${
                      (openFilterPopup === 'availability' || selectedDays.length > 0)
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                        : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                    }`}
                  >
                    Availability
                    {selectedDays.length > 0 && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-600 text-white px-1.5 text-[11px] font-semibold">
                        {selectedDays.length}
                      </span>
                    )}
                    <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${openFilterPopup === 'availability' ? 'rotate-180' : ''}`} />
                  </Button>
                  {openFilterPopup === 'availability' && (
                    <FilterDropdown
                      label="Availability"
                      options={availableDays}
                      selected={selectedDays}
                      onToggle={toggleDay}
                      onClose={() => setOpenFilterPopup(null)}
                    />
                  )}
                </div>
              </div>
              {(selectedFilters.length > 0 || selectedDays.length > 0 || selectedInstitutions.length > 0 || searchQuery || showFavorites || showRequested) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="md:ml-auto text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 h-7"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-yellow-600" />
            </div>
          ) : filteredMentors.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-10 h-10 text-yellow-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No mentors found</h3>
              <p className="text-gray-600 mb-4">Try adjusting your search or filters</p>
              <Button
                variant="outline"
                onClick={clearAllFilters}
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div>
              <div className="mb-4 text-sm text-gray-600">
                Found <span className="font-semibold text-yellow-700">{filteredMentors.length}</span> mentor{filteredMentors.length !== 1 ? 's' : ''}
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
