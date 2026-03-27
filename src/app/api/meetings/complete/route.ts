import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { getTokenCycleEvaluateAtIso, parseMeetingDateTime } from '@/lib/token-cycle';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { meetingId, menteeId, feedback, rating } = body;

    if (!meetingId || !menteeId) {
      return NextResponse.json(
        { message: 'meetingId and menteeId are required' },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    const validateFeedbackWindow = (meeting: any) => {
      if (meeting.decision !== 'accepted') {
        return { ok: false, status: 400, message: 'Feedback can only be submitted for accepted meetings.' };
      }

      const meetingDateTime = parseMeetingDateTime(meeting.date, meeting.time);
      if (!meetingDateTime) {
        return { ok: false, status: 400, message: 'Invalid meeting date/time format.' };
      }

      const now = new Date();
      const earliestFeedbackAt = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
      const latestValidFeedbackAt = new Date(meetingDateTime.getTime() + 14 * 24 * 60 * 60 * 1000);

      if (now < earliestFeedbackAt) {
        return {
          ok: false,
          status: 400,
          message: 'Feedback can only be submitted at least 2 hours after the meeting.',
        };
      }

      if (now > latestValidFeedbackAt) {
        return {
          ok: false,
          status: 400,
          message: 'Feedback window expired. Feedback must be submitted within 14 days after the meeting.',
        };
      }

      return { ok: true, status: 200, message: 'valid' };
    };

    // Find the meeting in both mentor and mentee containers
    let requester: any = null;
    let isRequesterMentor = false;
    let requesterContainer: any = null;
    let meetingFound = false;

    // Try to find requester in mentee container
    try {
      const { resource: menteeResource } = await menteeContainer.item(menteeId, menteeId).read();
      if (menteeResource && menteeResource.scheduling) {
        const meetingIndex = menteeResource.scheduling.findIndex(
          (m: any) => m.meetingId === meetingId
        );

        if (meetingIndex !== -1) {
          meetingFound = true;
          requester = menteeResource;
          requesterContainer = menteeContainer;

          const meeting = menteeResource.scheduling[meetingIndex];
          const validation = validateFeedbackWindow(meeting);
          if (!validation.ok) {
            return NextResponse.json({ message: validation.message }, { status: validation.status });
          }

          if (meeting.feedbackFormSent === true) {
            return NextResponse.json(
              {
                message: 'Feedback already submitted for this meeting',
                tokenReplenished: false,
                newTokenBalance: requester?.tokens || 0,
                alreadySubmitted: true,
              },
              { status: 200 }
            );
          }

          // Update feedback in mentee container
          const submittedAt = new Date().toISOString();
          const feedbackData = {
            rating: rating || null,
            feedback: feedback || '',
            submittedAt,
          };

          menteeResource.scheduling[meetingIndex].feedback_form = feedbackData;
          menteeResource.scheduling[meetingIndex].feedbackFormSent = true;
          menteeResource.scheduling[meetingIndex].feedbackFormSentAt = submittedAt;
          if (menteeResource.token_cycle?.status === 'pending' && menteeResource.token_cycle.meetingId === meetingId) {
            menteeResource.token_cycle.feedbackSubmittedAt = submittedAt;
            menteeResource.token_cycle.feedbackValid = true;
          }
          await menteeContainer.item(menteeId, menteeId).replace(menteeResource);

          // Also update mentor's copy
          const mentorId = meeting.mentorUID;

          const mentorQuerySpec = {
            query: 'SELECT * FROM c WHERE c.mentorUID = @mentorId',
            parameters: [{ name: '@mentorId', value: mentorId }],
          };

          const { resources: mentors } = await mentorContainer.items
            .query(mentorQuerySpec)
            .fetchAll();

          if (mentors.length > 0 && mentors[0].scheduling) {
            const mentor = mentors[0];
            const mentorMeetingIndex = mentor.scheduling.findIndex(
              (m: any) => m.meetingId === meetingId
            );

            if (mentorMeetingIndex !== -1) {
              mentor.scheduling[mentorMeetingIndex].feedback_form = feedbackData;
              mentor.scheduling[mentorMeetingIndex].feedbackFormSent = true;
              mentor.scheduling[mentorMeetingIndex].feedbackFormSentAt = submittedAt;
              await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.code === 404) {
        // Try mentor container (mentor acting as mentee)
        const requesterQuerySpec = {
          query: 'SELECT * FROM c WHERE c.mentee_id = @menteeId',
          parameters: [{ name: '@menteeId', value: menteeId }],
        };

        const { resources: mentorRequesters } = await mentorContainer.items
          .query(requesterQuerySpec)
          .fetchAll();

        if (mentorRequesters.length > 0 && mentorRequesters[0].scheduling) {
          const mentorRequester = mentorRequesters[0];
          const meetingIndex = mentorRequester.scheduling.findIndex(
            (m: any) => m.meetingId === meetingId
          );

          if (meetingIndex !== -1) {
            meetingFound = true;
            requester = mentorRequester;
            requesterContainer = mentorContainer;
            isRequesterMentor = true;

            const meeting = mentorRequester.scheduling[meetingIndex];
            const validation = validateFeedbackWindow(meeting);
            if (!validation.ok) {
              return NextResponse.json({ message: validation.message }, { status: validation.status });
            }

            if (meeting.feedbackFormSent === true) {
              return NextResponse.json(
                {
                  message: 'Feedback already submitted for this meeting',
                  tokenReplenished: false,
                  newTokenBalance: requester?.tokens || 0,
                  alreadySubmitted: true,
                },
                { status: 200 }
              );
            }

            // Update feedback
            const submittedAt = new Date().toISOString();
            const feedbackData = {
              rating: rating || null,
              feedback: feedback || '',
              submittedAt,
            };

            mentorRequester.scheduling[meetingIndex].feedback_form = feedbackData;
            mentorRequester.scheduling[meetingIndex].feedbackFormSent = true;
            mentorRequester.scheduling[meetingIndex].feedbackFormSentAt = submittedAt;
            if (mentorRequester.token_cycle?.status === 'pending' && mentorRequester.token_cycle.meetingId === meetingId) {
              mentorRequester.token_cycle.feedbackSubmittedAt = submittedAt;
              mentorRequester.token_cycle.feedbackValid = true;
            }
            await mentorContainer
              .item(mentorRequester.id, mentorRequester.id)
              .replace(mentorRequester);

            // Also update the target mentor's copy
            const targetMentorId = meeting.mentorUID;

            if (targetMentorId !== mentorRequester.mentorUID) {
              const targetMentorQuerySpec = {
                query: 'SELECT * FROM c WHERE c.mentorUID = @mentorId',
                parameters: [{ name: '@mentorId', value: targetMentorId }],
              };

              const { resources: targetMentors } = await mentorContainer.items
                .query(targetMentorQuerySpec)
                .fetchAll();

              if (targetMentors.length > 0 && targetMentors[0].scheduling) {
                const targetMentor = targetMentors[0];
                const targetMeetingIndex = targetMentor.scheduling.findIndex(
                  (m: any) => m.meetingId === meetingId
                );

                if (targetMeetingIndex !== -1) {
                  targetMentor.scheduling[targetMeetingIndex].feedback_form = feedbackData;
                  targetMentor.scheduling[targetMeetingIndex].feedbackFormSent = true;
                  targetMentor.scheduling[targetMeetingIndex].feedbackFormSentAt = submittedAt;
                  await mentorContainer
                    .item(targetMentor.id, targetMentor.id)
                    .replace(targetMentor);
                }
              }
            }
          }
        }
      }
    }

    if (!meetingFound) {
      return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Feedback submitted successfully',
      tokenReplenished: false,
      newTokenBalance: requester?.tokens || 0,
      tokenReplenishAt: getTokenCycleEvaluateAtIso(requester?.token_cycle?.tokenUsedAt),
    });
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    return NextResponse.json(
      {
        message: 'Failed to submit feedback',
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
