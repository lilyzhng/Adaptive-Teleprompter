
import { GoogleGenAI, Type as GeminiType, Modality } from '@google/genai';
import { PerformanceReport, HotTakeGlobalContext, HotTakePreference, HotTakeQuestion, BlindProblem } from '../types';
import { COACH_CONFIG, HOT_TAKE_CONFIG, WALKIE_TALKIE_CONFIG } from '../config/evaluationPrompts';

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
        model: COACH_CONFIG.model,
        config: {
            systemInstruction: COACH_CONFIG.systemPrompt,
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
        rating: { type: GeminiType.INTEGER, description: "Total score 0-100, sum of the 4 rubric scores" },
        summary: { type: GeminiType.STRING, description: "2-3 sentence assessment of the explanation" },
        suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
        // Strict rubric scoring - each category is 0-25 points
        rubricScores: {
            type: GeminiType.OBJECT,
            description: "Strict rubric scores, each 0-25 points. Total = rating.",
            properties: {
                algorithmScore: { type: GeminiType.INTEGER, description: "0-25: Did they identify the correct algorithm/pattern and explain the core logic?" },
                algorithmFeedback: { type: GeminiType.STRING, description: "What was correct or missing about the algorithm explanation" },
                edgeCasesScore: { type: GeminiType.INTEGER, description: "0-25: Did they mention relevant edge cases?" },
                edgeCasesFeedback: { type: GeminiType.STRING, description: "What edge cases were covered or missed" },
                timeComplexityScore: { type: GeminiType.INTEGER, description: "0-25: Did they correctly analyze time complexity?" },
                timeComplexityFeedback: { type: GeminiType.STRING, description: "What they said about time complexity vs expected" },
                spaceComplexityScore: { type: GeminiType.INTEGER, description: "0-25: Did they correctly analyze space complexity?" },
                spaceComplexityFeedback: { type: GeminiType.STRING, description: "What they said about space complexity vs expected" }
            },
            required: ["algorithmScore", "algorithmFeedback", "edgeCasesScore", "edgeCasesFeedback", "timeComplexityScore", "timeComplexityFeedback", "spaceComplexityScore", "spaceComplexityFeedback"]
        },
        mentalModelChecklist: {
            type: GeminiType.OBJECT,
            description: "Boolean flags indicating what was covered",
            properties: {
                correctPattern: { type: GeminiType.BOOLEAN, description: "Did they identify the correct algorithm pattern?" },
                logicCorrect: { type: GeminiType.BOOLEAN, description: "Is their core logic/approach correct?" },
                timeComplexityMentioned: { type: GeminiType.BOOLEAN, description: "Did they mention time complexity?" },
                timeComplexityCorrect: { type: GeminiType.BOOLEAN, description: "Is their time complexity analysis correct?" },
                spaceComplexityMentioned: { type: GeminiType.BOOLEAN, description: "Did they mention space complexity?" },
                spaceComplexityCorrect: { type: GeminiType.BOOLEAN, description: "Is their space complexity analysis correct?" },
                edgeCasesMentioned: { type: GeminiType.BOOLEAN, description: "Did they mention any edge cases?" }
            }
        },
        missingEdgeCases: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING }, description: "List of edge cases they should have mentioned but didn't" },
        detectedAutoScore: { type: GeminiType.STRING, description: "'good' if rating >= 75, 'partial' if 50-74, 'missed' if < 50" },
        detailedFeedback: {
            type: GeminiType.ARRAY,
            description: "Specific issues that need improvement",
            items: {
                type: GeminiType.OBJECT,
                properties: {
                    category: { type: GeminiType.STRING, description: "'Algorithm', 'Edge Cases', 'Time Complexity', or 'Space Complexity'" },
                    issue: { type: GeminiType.STRING, description: "What was wrong or missing" },
                    instance: { type: GeminiType.STRING, description: "What they said (or 'Not mentioned' if missing)" },
                    rewrite: { type: GeminiType.STRING, description: "What they should have said" },
                    explanation: { type: GeminiType.STRING, description: "Why this matters" }
                },
                required: ["category", "issue", "instance", "rewrite", "explanation"]
            }
        }
    },
    required: ["rating", "summary", "rubricScores", "mentalModelChecklist", "detectedAutoScore", "detailedFeedback", "missingEdgeCases"]
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
    const prompt = WALKIE_TALKIE_CONFIG.generatePrompt({
        title: currentProblem.title,
        prompt: currentProblem.prompt,
        pattern: currentProblem.pattern,
        keyIdea: currentProblem.keyIdea,
        timeComplexity: currentProblem.timeComplexity,
        spaceComplexity: currentProblem.spaceComplexity,
        expectedEdgeCases: currentProblem.expectedEdgeCases,
        steps: currentProblem.steps
    }, polishedText);

    const response = await ai.models.generateContent({
        model: WALKIE_TALKIE_CONFIG.model,
        contents: prompt,
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
    
    const prompt = HOT_TAKE_CONFIG.generatePrompt(
        question,
        context,
        transcript,
        globalContext.interviewer || 'Senior Hiring Manager',
        globalContext.company || 'a top tech company',
        globalContext.roundFocus || 'General behavioral interview',
        prefSummary
    );

    const response = await ai.models.generateContent({
        model: HOT_TAKE_CONFIG.model,
        contents: prompt,
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
