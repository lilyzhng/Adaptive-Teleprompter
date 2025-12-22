-- MicDrop Database Schema
-- Run this SQL in your Supabase SQL Editor to create the necessary tables

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: saved_items
-- Stores user's saved snippets (scripts, responses, tips, insights, highlights, drills)
CREATE TABLE IF NOT EXISTS public.saved_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('script', 'response', 'tip', 'improvement', 'highlight', 'drill')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: saved_reports
-- Stores user's performance analysis reports
CREATE TABLE IF NOT EXISTS public.saved_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('coach', 'walkie', 'hot-take')),
    rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 100),
    report_data JSONB NOT NULL,
    report_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_saved_items_user_id ON public.saved_items(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_created_at ON public.saved_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_reports_user_id ON public.saved_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_at ON public.saved_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_reports_report_date ON public.saved_reports(report_date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saved_items
-- Users can only see and modify their own items
CREATE POLICY "Users can view their own saved items"
    ON public.saved_items
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved items"
    ON public.saved_items
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved items"
    ON public.saved_items
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved items"
    ON public.saved_items
    FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for saved_reports
-- Users can only see and modify their own reports
CREATE POLICY "Users can view their own saved reports"
    ON public.saved_reports
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved reports"
    ON public.saved_reports
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved reports"
    ON public.saved_reports
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved reports"
    ON public.saved_reports
    FOR DELETE
    USING (auth.uid() = user_id);

