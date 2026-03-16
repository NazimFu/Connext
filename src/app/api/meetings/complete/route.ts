import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

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

          // Update feedback in mentee container
          const feedbackData = {
            rating: rating || null,
            feedback: feedback || '',
            submittedAt: new Date().toISOString(),
          };

          menteeResource.scheduling[meetingIndex].feedback_form = feedbackData;
          await menteeContainer.item(menteeId, menteeId).replace(menteeResource);

          // Also update mentor's copy
          const meeting = menteeResource.scheduling[meetingIndex];
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
              await mentorContainer.item(mentor.id, mentor.mentorUID).replace(mentor);
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

            // Update feedback
            const feedbackData = {
              rating: rating || null,
              feedback: feedback || '',
              submittedAt: new Date().toISOString(),
            };

            mentorRequester.scheduling[meetingIndex].feedback_form = feedbackData;
            await mentorContainer
              .item(mentorRequester.id, mentorRequester.mentorUID)
              .replace(mentorRequester);

            // Also update the target mentor's copy
            const meeting = mentorRequester.scheduling[meetingIndex];
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
                  await mentorContainer
                    .item(targetMentor.id, targetMentor.mentorUID)
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

    // Replenish token to requester
    if (requester) {
      const currentTokens = requester.tokens || 0;
      requester.tokens = currentTokens + 1;

      if (isRequesterMentor) {
        await mentorContainer.item(requester.id, requester.mentorUID).replace(requester);
      } else {
        await menteeContainer.item(requester.id, requester.id).replace(requester);
      }

      console.log(
        `💰 Replenished 1 token to requester after feedback. New balance: ${requester.tokens}`
      );
    }

    return NextResponse.json({
      message: 'Feedback submitted successfully',
      tokenReplenished: true,
      newTokenBalance: requester?.tokens || 0,
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
