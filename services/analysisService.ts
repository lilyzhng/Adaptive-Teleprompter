
import { GoogleGenAI, Type as GeminiType, Modality } from '@google/genai';
import { PerformanceReport, HotTakeGlobalContext, HotTakePreference, HotTakeQuestion, BlindProblem } from '../types';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// Remove generateTTS and analyzeTeleprompterRecording imports and functions if they are no longer used.
// Or just remove the specific function `analyzeTeleprompterRecording`.

export const analyzeStage1_Transcribe = async (base64Audio: string, mimeType: string, context: string) => {
    const transcriptResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
           systemInstruction: `You are a Professional Forensic Transcriber.
           Objective: Convert interview audio into a verbatim transcript optimized for behavioral analysis.
           Guidelines:
           1. Verbatim Accuracy: Do not "clean up" grammar. Keep all "ums," "uhs," "likes," and repeated words. These are crucial for the coach to analyze later.
           2. Speaker Identification: Label speakers clearly (e.g., [Candidate], [Recruiter]) based on context.
           3. Timestamps: Insert a timestamp [00:00] every 30-60 seconds or at every speaker change.
           4. Non-Verbal Cues: Transcribe significant sounds in brackets, e.g., [nervous laughter], [long pause], [sigh], [typing noise].
           5. Output Format: Clean Markdown.
           6. Start Logic: Ignore any initial background noise, rustling, static, or setup sounds (e.g. microphone adjustments) at the very beginning of the file. Start the transcription strictly at the first intelligible human speech.`
        },
        contents: {
            parts: [
                { inlineData: { mimeType: mimeType, data: base64Audio } },
                { text: `Please transcribe the attached audio file following the forensic guidelines.
                User Context to identify speakers: "${context}"` }
            ]
        }
    });
    
    return transcriptResponse.text;
};

export const analyzeStage2_Coach = async (base64Audio: string | null, transcript: string, context: string, mimeType: string = 'audio/mp3'): Promise<PerformanceReport> => {
    // Construct parts based on available input
    const parts: any[] = [];
    
    if (base64Audio) {
       parts.push({ inlineData: { mimeType: mimeType, data: base64Audio } });
    }

    let promptText = `Context: ${context}\n\n`;
    if (base64Audio) {
        promptText += `Input 1: Attached is the original Audio.\n`;
        promptText += `Input 2: Below is the Transcript generated from this call.\n\n${transcript}\n\n`;
        promptText += `Task:\nBased on the Audio (for tone) and the Text (for content), analyze my performance...`;
    } else {
        promptText += `Input: Below is the Transcript of the interview.\n\n${transcript}\n\n`;
        promptText += `Task:\nBased on the Text content, analyze my performance... Note: Since no audio is provided, focus primarily on content, structure, and strategy. Skip delivery/tone analysis if impossible.`;
    }
    
    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        config: {
            systemInstruction: `Role: You are the "Stage 2: Coach" for the MicDrop interview preparation app. Your user is a Technical Team Lead / Engineering Manager candidate (balancing technical depth with vision/people management).

            Goal: Analyze the user's interview transcript/audio input and provide "brutally honest" feedback to specific issues.
            
            KEY REQUIREMENT: HUMAN STORY REWRITING
            For every issue identified in the "Areas for Improvement" section, you MUST provide a "Human Rewrite" instead of a generic strategy.
            
            The Rewrite Philosophy:
            - The goal is NOT a polished press release. It is to sound like a colleague grabbing coffee.
            - Use "Bridge Words": "To be honest...", "Here's the thing...", "I say this with love...".
            - Use Vulnerability/Humor: Make it relatable.
            - Use Check-ins: "Does that match what you're seeing?"

            KEY REQUIREMENT: DELIVERY DYNAMICS (Pronunciation & Clarity)
            You must identify 3 specific moments where the user sounded 'Machine Gun' (Rushed/Monotone) vs 'Maestro' (Varied Pace/Emphasis).
            - Focus on Technical Terms: Candidates often rush "Convolutional Neural Networks". They should say "Con-vo-LU-tion-al... Neu-ral... NET-works".
            - Focus on Tone: Detect robotic delivery.
            - Create a "Drill": Use visual cues like UPPERCASE for stress and '...' for pauses.
            - NOTE: If no audio file is provided, skip this section or provide general advice based on the text structure (e.g. run-on sentences).
            
            Output Format:
            Provide feedback in this exact structure:
            1.  **The Diagnosis:** A 1-2 sentence summary of the biggest red flag.
            2.  **The Fix:** Tactical advice (Structure, Soft Skills).
            3.  **The "Human" Rewrite (Global):** A rewrite of the most critical part of their answer to sound conversational and high-EQ.
            4.  **Detailed Improvements:** For each specific issue found, provide:
                - Question: The specific question or discussion point from the interviewer that prompted this response (extract from transcript, or infer based on the answer).
                - The Issue: What went wrong.
                - Specific Instance: Quote the transcript.
                - The Human Rewrite: Rewrite THAT SPECIFIC part to be better.
                - Why This Works: Explain the EQ/Soft skills used (e.g. "bridge words signal authenticity").

            KEY REQUIREMENT: FLIP THE TABLE (Question Analysis)
            Analyze the questions the candidate asked during the interview. This is crucial for showing interest and strategic thinking.
            
            For each question the candidate asked:
            1. Extract the exact question
            2. Identify the conversation context when it was asked
            3. Analyze what was good or needs improvement
            4. If improvement needed, provide a better version that references the conversation context
            5. Explain why the improved version is stronger
            
            Also identify "Missed Opportunities":
            - Great questions the candidate SHOULD have asked but didn't
            - Base these on the actual conversation context
            - Explain why these questions would have demonstrated interest/strategic thinking
            
            Philosophy:
            - Great questions reference specific points from the conversation ("You mentioned X earlier...")
            - Great questions show curiosity about the role/team/company
            - Great questions demonstrate the candidate did research and is connecting dots
            - Avoid generic questions that could be asked anywhere
            
            Output Style:
            - Rating: 0-100 integer scale.
            - **Separation**: Split into 'detailedFeedback' (Improvements) and 'highlights' (Strengths).
            - detailedFeedback: MUST use the 'rewrite' and 'explanation' fields instead of generic improvement strategies.
            - highlights: Areas where the candidate excelled.
            - flipTheTable: Analysis of questions asked by the candidate and missed opportunities.
            `,
            responseMimeType: "application/json",
            responseSchema: {
                type: GeminiType.OBJECT,
                properties: {
                    rating: { type: GeminiType.INTEGER },
                    summary: { type: GeminiType.STRING },
                    suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
                    coachingRewrite: {
                        type: GeminiType.OBJECT,
                        properties: {
                            diagnosis: { type: GeminiType.STRING },
                            fix: { type: GeminiType.STRING },
                            rewrite: { type: GeminiType.STRING }
                        },
                        required: ["diagnosis", "fix", "rewrite"]
                    },
                    detailedFeedback: {
                        type: GeminiType.ARRAY,
                        description: "Areas for Improvement. For each issue, provide a Human Rewrite AND the specific question.",
                        items: {
                            type: GeminiType.OBJECT,
                            properties: {
                                category: { type: GeminiType.STRING },
                                question: { type: GeminiType.STRING, description: "The specific question or discussion point from the interviewer that prompted this response." },
                                issue: { type: GeminiType.STRING },
                                instance: { type: GeminiType.STRING },
                                rewrite: { type: GeminiType.STRING, description: "The revised, human-sounding version of the answer." },
                                explanation: { type: GeminiType.STRING, description: "Why this rewrite works (soft skills analysis)." }
                            },
                            required: ["category", "question", "issue", "instance", "rewrite", "explanation"]
                        }
                    },
                    highlights: {
                        type: GeminiType.ARRAY,
                        description: "Positive feedback / Key Strengths / Good Answers. Include the question.",
                        items: {
                            type: GeminiType.OBJECT,
                            properties: {
                                category: { type: GeminiType.STRING },
                                question: { type: GeminiType.STRING, description: "The specific question from the interviewer." },
                                strength: { type: GeminiType.STRING },
                                quote: { type: GeminiType.STRING }
                            },
                            required: ["category", "question", "strength", "quote"]
                        }
                    },
                    pronunciationFeedback: { 
                        type: GeminiType.ARRAY, 
                        description: "3 Specific drills to fix Monotone/Rushed delivery. Include the question context.",
                        items: { 
                            type: GeminiType.OBJECT,
                            properties: {
                                phrase: { type: GeminiType.STRING, description: "The original phrase spoken" },
                                question: { type: GeminiType.STRING, description: "The question being answered when this was said" },
                                issue: { type: GeminiType.STRING, description: "e.g. 'Rushed technical term', 'Monotone'" },
                                practiceDrill: { type: GeminiType.STRING, description: "Visual guide using CAPS and ... for rhythm" },
                                reason: { type: GeminiType.STRING, description: "Why this emphasis matters" }
                            },
                            required: ["phrase", "question", "issue", "practiceDrill", "reason"]
                        } 
                    },
                    flipTheTable: {
                        type: GeminiType.OBJECT,
                        description: "Analysis of questions the candidate asked (or should have asked) to flip the table and show interest.",
                        properties: {
                            candidateQuestions: {
                                type: GeminiType.ARRAY,
                                description: "Questions the candidate actually asked during the interview",
                                items: {
                                    type: GeminiType.OBJECT,
                                    properties: {
                                        questionAsked: { type: GeminiType.STRING, description: "The exact question the candidate asked" },
                                        context: { type: GeminiType.STRING, description: "The conversation context when this question was asked" },
                                        analysis: { type: GeminiType.STRING, description: "What was good or problematic about this question" },
                                        improvedVersion: { type: GeminiType.STRING, description: "How to improve this question (if needed). Leave empty if question was already strong." },
                                        reasoning: { type: GeminiType.STRING, description: "Why the improved version is better, or why the original was strong" }
                                    },
                                    required: ["questionAsked", "context", "analysis", "reasoning"]
                                }
                            },
                            missedOpportunities: {
                                type: GeminiType.ARRAY,
                                description: "Great questions the candidate should have asked but didn't, based on conversation context",
                                items: {
                                    type: GeminiType.OBJECT,
                                    properties: {
                                        suggestedQuestion: { type: GeminiType.STRING, description: "A great question the candidate should have asked" },
                                        context: { type: GeminiType.STRING, description: "When/why this would have been relevant based on the conversation" },
                                        impact: { type: GeminiType.STRING, description: "Why asking this would have made a strong impression" }
                                    },
                                    required: ["suggestedQuestion", "context", "impact"]
                                }
                            },
                            overallAssessment: { type: GeminiType.STRING, description: "General feedback on the candidate's question-asking strategy" }
                        },
                        required: ["candidateQuestions", "missedOpportunities", "overallAssessment"]
                    }
                },
                required: ["rating", "summary", "suggestions", "detailedFeedback", "highlights", "coachingRewrite", "pronunciationFeedback", "flipTheTable"]
            }
        },
        contents: {
            parts: parts
        }
    });

    return JSON.parse(response.text);
};

// ========== WALKIE TALKIE FUNCTIONS ==========

const WALKIE_REPORT_SCHEMA = {
    type: GeminiType.OBJECT,
    properties: {
        rating: { type: GeminiType.INTEGER },
        summary: { type: GeminiType.STRING },
        suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
        pronunciationFeedback: { type: GeminiType.ARRAY, items: { type: GeminiType.OBJECT, properties: { phrase: { type: GeminiType.STRING }, issue: { type: GeminiType.STRING }, practiceDrill: { type: GeminiType.STRING }, reason: { type: GeminiType.STRING } } } },
        mentalModelChecklist: {
            type: GeminiType.OBJECT,
            properties: {
                logicCorrect: { type: GeminiType.BOOLEAN },
                edgeCasesMentioned: { type: GeminiType.BOOLEAN },
                complexityAnalyzed: { type: GeminiType.BOOLEAN },
                exampleTraced: { type: GeminiType.BOOLEAN },
            }
        },
        missingEdgeCases: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
        detectedAutoScore: { type: GeminiType.STRING },
    },
    required: ["rating", "summary", "detectedAutoScore"]
};

const BLIND_PROBLEM_SCHEMA = {
    type: GeminiType.ARRAY,
    items: {
        type: GeminiType.OBJECT,
        properties: {
            id: { type: GeminiType.STRING },
            title: { type: GeminiType.STRING },
            prompt: { type: GeminiType.STRING },
            example: { type: GeminiType.STRING },
            constraints: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
            pattern: { type: GeminiType.STRING },
            keyIdea: { type: GeminiType.STRING },
            skeleton: { type: GeminiType.STRING },
            timeComplexity: { type: GeminiType.STRING },
            spaceComplexity: { type: GeminiType.STRING },
            steps: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
            expectedEdgeCases: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
        }
    }
};

export const analyzeWalkieSession = async (base64Audio: string, polishedText: string, currentProblem: BlindProblem): Promise<PerformanceReport> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
            Analyze this coding interview explanation.
            Problem: ${currentProblem.title}
            Description: ${currentProblem.prompt}
            User's Explanation: "${polishedText}"
            
            Evaluate if the user correctly identified the pattern, complexity, and edge cases.
            Set 'detectedAutoScore' to 'good' if the solution is correct and optimal.
            Set 'detectedAutoScore' to 'partial' if it's correct but suboptimal or missing edge cases.
            Set 'detectedAutoScore' to 'missed' if the approach is wrong.

            CRITICAL: Return PURE JSON. Do not include internal monologue or thinking steps in the output strings.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: WALKIE_REPORT_SCHEMA
        }
    });
    return JSON.parse(response.text);
};

export const refineTranscript = async (rawTranscript: string, currentProblem: BlindProblem): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
            Refine the following raw speech-to-text transcript from a technical interview.
            The user is solving the coding problem: "${currentProblem.title}".
            Fix technical terms (e.g., "hash map", "O of N", "dynamic programming").
            Remove filler words (um, ah, like). Keep the sentence structure natural.
            
            Raw: "${rawTranscript}"
            
            Return only the refined transcript text.
        `
    });
    return response.text || rawTranscript;
};

export const generateProblemSet = async (topics: string[], batchSize: number): Promise<BlindProblem[]> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
        You are an Interview Problem Database.
        Generate ${batchSize} authentic Blind 75 / LeetCode problems related to these topics: ${topics.join(', ')}.
        
        CRITICAL RULES:
        1. DO NOT HALLUCINATE OR INVENT NEW PROBLEMS. Use only well-known Blind 75 / LeetCode 150 problems.
        2. DO NOT change the problem context to fit a theme (e.g., do not mention coffee shops, parks, or baristas). Use the ORIGINAL problem statement (e.g., "Given an array of integers...").
        3. The 'prompt' field must be the full, original problem description.
        
        Return JSON.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: BLIND_PROBLEM_SCHEMA
        }
    });
    return JSON.parse(response.text || "[]");
};

// ========== HOT TAKE FUNCTIONS ==========

const HOT_TAKE_REPORT_SCHEMA = {
    type: GeminiType.OBJECT,
    properties: {
        rating: { type: GeminiType.INTEGER },
        summary: { type: GeminiType.STRING },
        suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
        pronunciationFeedback: { type: GeminiType.ARRAY, items: { type: GeminiType.OBJECT, properties: { phrase: { type: GeminiType.STRING }, issue: { type: GeminiType.STRING }, practiceDrill: { type: GeminiType.STRING }, reason: { type: GeminiType.STRING } } } },
        hotTakeRubric: {
            type: GeminiType.OBJECT,
            properties: {
                clarity: { type: GeminiType.INTEGER },
                technicalDepth: { type: GeminiType.INTEGER },
                strategicThinking: { type: GeminiType.INTEGER },
                executivePresence: { type: GeminiType.INTEGER },
            }
        },
        followUpQuestion: { type: GeminiType.STRING },
        hotTakeMasterRewrite: { type: GeminiType.STRING },
    },
    required: ["rating", "summary", "hotTakeRubric", "followUpQuestion", "hotTakeMasterRewrite"]
};

const HOT_TAKE_QUESTION_SCHEMA = {
    type: GeminiType.ARRAY,
    items: {
        type: GeminiType.OBJECT,
        properties: {
            id: { type: GeminiType.STRING },
            title: { type: GeminiType.STRING },
            context: { type: GeminiType.STRING },
            probingPrompt: { type: GeminiType.STRING },
        }
    }
};

export const evaluateHotTakeInitial = async (
    transcript: string, 
    question: string, 
    context: string, 
    globalContext: HotTakeGlobalContext, 
    preferences: HotTakePreference[]
): Promise<PerformanceReport> => {
    const prefSummary = preferences.map(p => `- [${p.type}] on "${p.questionText}": ${p.feedback}`).join('\n');
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `
            Evaluate this interview answer (Hot Take Protocol).
            Role: ${globalContext.interviewer || 'Senior Hiring Manager'} at ${globalContext.company || 'a top tech company'}.
            Round Focus: ${globalContext.roundFocus || 'General behavioral interview'}.
            User Preferences History:
            ${prefSummary || 'No previous preferences recorded.'}

            Question: "${question}"
            Context/Intent: "${context}"
            Answer: "${transcript}"

            Generate a performance report including:
            1. A score (0-100).
            2. A "hotTakeRubric" with scores (each 0-25) for: clarity, technicalDepth, strategicThinking, executivePresence.
            3. A "followUpQuestion" that probes deeper based on the weakness of the answer. Make it specific and challenging.
            4. A "hotTakeMasterRewrite" that improves the answer to be executive-level.
            5. A brief "summary" critiquing the response.

            CRITICAL: Return PURE JSON. Do not include internal monologue, "thinking steps", or parenthetical notes inside the JSON string fields.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: HOT_TAKE_REPORT_SCHEMA
        }
    });
    return JSON.parse(response.text);
};

export const finalizeHotTake = async (historyJson: string, globalContext: HotTakeGlobalContext): Promise<PerformanceReport> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `
            Finalize this Hot Take session. Evaluate the candidate's follow-up response.
            History: ${historyJson}
            Context: ${globalContext.company || 'Tech Company'}, ${globalContext.roundFocus || 'Behavioral Interview'}.
            
            Provide a final performance report for this follow-up round:
            1. A score (0-100) for the follow-up answer specifically.
            2. A "hotTakeRubric" with scores (each 0-25) for: clarity, technicalDepth, strategicThinking, executivePresence.
            3. A "hotTakeMasterRewrite" showing how to improve the follow-up answer.
            4. A "summary" with specific critique of the follow-up response.

            CRITICAL: Return PURE JSON. No meta-commentary or internal thought traces in the output strings.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: HOT_TAKE_REPORT_SCHEMA
        }
    });
    return JSON.parse(response.text);
};

export const refineHotTakeTranscript = async (rawTranscript: string, context: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Refine this speech-to-text transcript from an interview answer.
        Context: ${context}
        Raw transcript: "${rawTranscript}"
        
        Fix technical terms, remove filler words (um, ah, like), and clean up the grammar while preserving the speaker's intent and style.
        Return only the refined transcript text.`
    });
    return response.text || rawTranscript;
};

export const customizeHotTakeQuestions = async (baseQuestions: HotTakeQuestion[], globalContext: HotTakeGlobalContext): Promise<HotTakeQuestion[]> => {
    if (!globalContext.company && !globalContext.roundFocus) {
        return baseQuestions;
    }
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
            Customize these interview questions for ${globalContext.company || 'a tech company'}.
            Interviewer Role: ${globalContext.interviewer || 'Senior Hiring Manager'}.
            Round Focus: ${globalContext.roundFocus || 'General behavioral interview'}.
            
            Base Questions: ${JSON.stringify(baseQuestions)}
            
            Return a list of modified questions with updated titles and contexts to be more specific to the company/role.
            Keep the same IDs as the original questions.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: HOT_TAKE_QUESTION_SCHEMA
        }
    });
    return JSON.parse(response.text || "[]");
};

export const regenerateHotTakeFollowUp = async (
    transcript: string,
    previousQuestion: string,
    feedback: string,
    globalContext: HotTakeGlobalContext
): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
            The user disliked the previous follow-up question: "${previousQuestion}".
            Feedback: "${feedback}".
            
            Context: User answered "${transcript}" to an interview question.
            Role: ${globalContext.interviewer || 'Senior Hiring Manager'} at ${globalContext.company || 'a tech company'}.
            
            Generate a BETTER, different follow-up question that:
            1. Is more relevant to what the user actually said
            2. Probes a different angle or weakness
            3. Is specific and challenging
            
            Return only the new question text.
        `
    });
    return response.text || "Could you elaborate on that point?";
};
