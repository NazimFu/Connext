declare module 'ics' {
  export type DateArray = [number, number, number, number, number];

  export interface Attendee {
    name?: string;
    email: string;
    rsvp?: boolean;
    partstat?: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED';
    role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT';
  }

  export interface Organizer {
    name?: string;
    email: string;
  }

  export interface EventAttributes {
    start: DateArray;
    end: DateArray;
    title: string;
    description?: string;
    location?: string;
    url?: string;
    status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
    busyStatus?: 'BUSY' | 'FREE' | 'TENTATIVE' | 'OOF';
    organizer?: Organizer;
    attendees?: Attendee[];
    productId?: string;
    uid?: string;
  }

  export type NodeCallback = (error: Error | undefined, value: string) => void;

  export function createEvents(
    events: EventAttributes[],
    callback: NodeCallback
  ): void;
}