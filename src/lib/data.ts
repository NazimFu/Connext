

import type { MeetingRequest, MeetingHistory, MentorAnalytics } from './types';

export const meetingRequests: MeetingRequest[] = [
  {
    id: 'req-1',
    menteeName: 'Peter Parker',
    mentorId: '1', // Alice Johnson
    dateTime: new Date(new Date().setDate(new Date().getDate() + 2)),
    message: 'Looking for advice on breaking into software engineering.',
    status: 'pending',
  },
  {
    id: 'req-2',
    menteeName: 'Gwen Stacy',
    mentorId: '1', // Alice Johnson
    dateTime: new Date(new Date().setDate(new Date().getDate() + 3)),
    message: 'Need help with my resume and cover letter for a product manager role.',
    status: 'pending',
  },
  {
    id: 'req-3',
    menteeName: 'Miles Morales',
    mentorId: '2', // Bob Williams
    dateTime: new Date(new Date().setDate(new Date().getDate() + 4)),
    message: 'Interested in learning more about UX/UI design principles.',
    status: 'pending',
  },
  {
    id: 'req-4',
    menteeName: 'Mary Jane Watson',
    mentorId: '1', // Alice Johnson
    dateTime: new Date(new Date().setDate(new Date().getDate() + 5)),
    message: 'I would like to discuss career paths in data science.',
    status: 'approved',
    meetingLink: 'https://meet.google.com/sim-approved-4'
  },
    {
    id: 'req-5',
    menteeName: 'Harry Osborn',
    mentorId: '1', // Alice Johnson
    dateTime: new Date(new Date().setDate(new Date().getDate() - 1)),
    message: 'Past meeting.',
    status: 'approved',
    meetingLink: 'https://meet.google.com/sim-approved-5'
  },
];


export const meetingHistory: MeetingHistory[] = [
    {
        id: 'hist-1',
        mentorId: '1',
        menteeName: 'Harry Osborn',
        dateTime: new Date('2024-05-20T10:00:00Z'),
        duration: 60,
        topic: 'System Design Interview Prep',
        rating: 5,
        notes: 'Harry is making great progress. We reviewed common patterns and he is ready for mock interviews.'
    },
    {
        id: 'hist-2',
        mentorId: '1',
        menteeName: 'Felicia Hardy',
        dateTime: new Date('2024-05-18T14:00:00Z'),
        duration: 45,
        topic: 'Frontend Code Review',
        rating: 4,
        notes: 'Code was clean. Discussed state management strategies for large React applications.'
    },
    {
        id: 'hist-3',
        mentorId: '2',
        menteeName: 'Eddie Brock',
        dateTime: new Date('2024-05-15T11:00:00Z'),
        duration: 60,
        topic: 'Product Roadmap Strategy',
        rating: 5,
    }
];

export const mentorAnalytics: MentorAnalytics[] = [
    {
        mentorId: '1',
        totalMeetings: 24,
        totalHours: 21,
        averageRating: 4.9,
        monthlyMeetings: [
            { month: 'Jan', count: 3 },
            { month: 'Feb', count: 4 },
            { month: 'Mar', count: 5 },
            { month: 'Apr', count: 4 },
            { month: 'May', count: 6 },
            { month: 'Jun', count: 2 },
        ],
        topicsDiscussed: [
            { topic: 'Career Advice', count: 10 },
            { topic: 'Interview Prep', count: 8 },
            { topic: 'Code Review', count: 6 },
        ]
    },
    {
        mentorId: '2',
        totalMeetings: 15,
        totalHours: 15,
        averageRating: 4.7,
        monthlyMeetings: [
            { month: 'Jan', count: 2 },
            { month: 'Feb', count: 2 },
            { month: 'Mar', count: 3 },
            { month: 'Apr', count: 4 },
            { month: 'May', count: 3 },
            { month: 'Jun', count: 1 },
        ],
        topicsDiscussed: [
            { topic: 'Roadmap Planning', count: 7 },
            { topic: 'User Research', count: 5 },
            { topic: 'Agile Best Practices', count: 3 },
        ]
    }
];
