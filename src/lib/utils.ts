import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { User } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function getMenteeRedirectPath(user: User): string {
  if (user.role !== 'mentee') return '/';
  
  switch (user.verificationStatus) {
    case 'just-approved':
      return '/mentee/verified';
    case 'approved':
      return '/mentee/mentor-listing';
    case 'pending':
      return '/login';
    case 'not-submitted':
    case 'rejected':
      return '/mentee/verification';
    default:
      return '/';
  }
}

/**
 * Converts a Google Drive sharing link to a direct image URL
 * @param url - The Google Drive sharing URL or any image URL
 * @returns The direct image URL
 */
export function getGoogleDriveImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  
  // Handle Google Drive URLs by proxying them through our API
  const drivePatterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];
  
  for (const pattern of drivePatterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      // Proxy Google Drive images through our API to avoid CORS issues
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  }
  
  // Return original URL if not a Google Drive link
  return url;
}
