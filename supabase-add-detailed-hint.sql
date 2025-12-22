-- Migration: Add detailed_hint column to blind_problems table
-- This column provides a more thorough walkthrough of the problem-solving approach
-- Run this BEFORE running supabase-seed-detailed-hints.sql

-- Add the detailed_hint column
ALTER TABLE public.blind_problems
ADD COLUMN IF NOT EXISTS detailed_hint TEXT;

-- Add a comment describing the column purpose
COMMENT ON COLUMN public.blind_problems.detailed_hint IS 'A detailed narrative walkthrough of how to approach and solve the problem, providing more guidance than key_idea but stopping short of giving the full solution code.';
