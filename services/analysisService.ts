
import { GoogleGenAI, Type as GeminiType, Modality } from '@google/genai';
import { PerformanceReport } from '../types';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const generateTTS = async (text: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: text }] },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }
            }
        }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned from TTS");
    return base64Audio;
};

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
                - The Issue: What went wrong.
                - Specific Instance: Quote the transcript.
                - The Human Rewrite: Rewrite THAT SPECIFIC part to be better.
                - Why This Works: Explain the EQ/Soft skills used (e.g. "bridge words signal authenticity").

            Output Style:
            - Rating: 0-100 integer scale.
            - **Separation**: Split into 'detailedFeedback' (Improvements) and 'highlights' (Strengths).
            - detailedFeedback: MUST use the 'rewrite' and 'explanation' fields instead of generic improvement strategies.
            - highlights: Areas where the candidate excelled.
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
                        description: "Areas for Improvement. For each issue, provide a Human Rewrite.",
                        items: {
                            type: GeminiType.OBJECT,
                            properties: {
                                category: { type: GeminiType.STRING },
                                issue: { type: GeminiType.STRING },
                                instance: { type: GeminiType.STRING },
                                rewrite: { type: GeminiType.STRING, description: "The revised, human-sounding version of the answer." },
                                explanation: { type: GeminiType.STRING, description: "Why this rewrite works (soft skills analysis)." }
                            },
                            required: ["category", "issue", "instance", "rewrite", "explanation"]
                        }
                    },
                    highlights: {
                        type: GeminiType.ARRAY,
                        description: "Positive feedback / Key Strengths / Good Answers.",
                        items: {
                            type: GeminiType.OBJECT,
                            properties: {
                                category: { type: GeminiType.STRING },
                                strength: { type: GeminiType.STRING },
                                quote: { type: GeminiType.STRING }
                            },
                            required: ["category", "strength", "quote"]
                        }
                    },
                    pronunciationFeedback: { 
                        type: GeminiType.ARRAY, 
                        description: "3 Specific drills to fix Monotone/Rushed delivery",
                        items: { 
                            type: GeminiType.OBJECT,
                            properties: {
                                phrase: { type: GeminiType.STRING, description: "The original phrase spoken" },
                                issue: { type: GeminiType.STRING, description: "e.g. 'Rushed technical term', 'Monotone'" },
                                practiceDrill: { type: GeminiType.STRING, description: "Visual guide using CAPS and ... for rhythm" },
                                reason: { type: GeminiType.STRING, description: "Why this emphasis matters" }
                            },
                            required: ["phrase", "issue", "practiceDrill", "reason"]
                        } 
                    }
                },
                required: ["rating", "summary", "suggestions", "detailedFeedback", "highlights", "coachingRewrite", "pronunciationFeedback"]
            }
        },
        contents: {
            parts: parts
        }
    });

    return JSON.parse(response.text);
};

export const analyzeTeleprompterRecording = async (base64Audio: string, scriptText: string): Promise<PerformanceReport> => {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
                { text: `You are an expert public speaking coach. Analyze this audio recording of a speech. I will provide the original script below. Compare the audio to the script. Check for mispronunciations or unclear words. 

Original Script:
"${scriptText}"

Provide a JSON report with: 
- rating (integer 0-100)
- summary
- suggestions (3 general tips)
- pronunciationFeedback (list of specific words that were mispronounced or unclear, compared to the script. If none, leave empty)` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: GeminiType.OBJECT,
                properties: {
                    rating: { type: GeminiType.INTEGER },
                    summary: { type: GeminiType.STRING },
                    suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
                    pronunciationFeedback: { 
                        type: GeminiType.ARRAY, 
                        items: { 
                            type: GeminiType.OBJECT,
                            properties: {
                                phrase: { type: GeminiType.STRING },
                                issue: { type: GeminiType.STRING },
                                practiceDrill: { type: GeminiType.STRING },
                                reason: { type: GeminiType.STRING }
                            },
                            required: ["phrase", "issue", "practiceDrill", "reason"]
                        } 
                    }
                },
                required: ["rating", "summary", "suggestions", "pronunciationFeedback"]
            }
        }
    });

    return JSON.parse(response.text);
};
