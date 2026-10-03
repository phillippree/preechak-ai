/**
 * Reusable Prompt & Persona Blocks
 */

const { defaultRegistry } = require('./blockRegistry');

const promptBlocks = [
    {
        id: 'job_interview',
        name: 'Job Interview Persona',
        description: 'Focuses on direct answers, STAR method explanations, and technical clarity.',
        role: 'interview',
        formatInstructions: 'Provide concise, structured answers using bullet points and code examples where applicable.',
        systemPromptModifier: 'You are an expert technical interview co-pilot assisting the candidate in real-time.',
    },
    {
        id: 'business_meeting',
        name: 'Business Meeting Assistant',
        description: 'Summarizes key discussion points, tracks action items, and organizes takeaways.',
        role: 'meeting',
        formatInstructions: 'Organize responses into Key Discussion Points, Decisions Made, and Action Items.',
        systemPromptModifier: 'You are an executive meeting assistant taking structured notes and synthesizing discussions.',
    },
    {
        id: 'pair_programming',
        name: 'Pair Programming & Debugging',
        description: 'Analyzes screen code snippets, identifies bugs, and suggests optimized syntax.',
        role: 'coding',
        formatInstructions: 'Highlight code diffs, explain root cause, and provide production-ready solutions.',
        systemPromptModifier: 'You are a senior staff software engineer pair-programming and reviewing code in real-time.',
    },
    {
        id: 'general_assistant',
        name: 'General Real-Time Assistant',
        description: 'Versatile assistant for conversational queries, screen interpretation, and general transcription.',
        role: 'general',
        formatInstructions: 'Provide direct, clear, and actionable answers.',
        systemPromptModifier: 'You are a real-time multimodal AI assistant helping the user with on-screen and spoken context.',
    },
];

function registerDefaultPromptBlocks(registry = defaultRegistry) {
    for (const block of promptBlocks) {
        registry.register('prompt', block.id, block);
    }
}

registerDefaultPromptBlocks();

module.exports = {
    promptBlocks,
    registerDefaultPromptBlocks,
};
