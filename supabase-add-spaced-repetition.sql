-- Spaced Repetition Tables for Blind 75 Progress Tracking
-- Run this migration in your Supabase SQL Editor

-- ============================================
-- Table: user_study_settings
-- Stores user preferences for study plan
-- ============================================
CREATE TABLE IF NOT EXISTS user_study_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    target_days INT DEFAULT 10,
    daily_cap INT DEFAULT 15,
    easy_bonus INT DEFAULT 10,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_study_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_study_settings
CREATE POLICY "Users can view their own settings"
    ON user_study_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
    ON user_study_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON user_study_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- Table: user_problem_progress
-- Tracks progress on each problem per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_problem_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    problem_title TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'mastered')),
    best_score INT,
    reviews_needed INT DEFAULT 2,
    reviews_completed INT DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, problem_title)
);

-- Enable RLS
ALTER TABLE user_problem_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_problem_progress
CREATE POLICY "Users can view their own progress"
    ON user_problem_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
    ON user_problem_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
    ON user_problem_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own progress"
    ON user_problem_progress FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- Indexes for better query performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_problem_progress_user_id 
    ON user_problem_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_user_problem_progress_status 
    ON user_problem_progress(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_problem_progress_next_review 
    ON user_problem_progress(user_id, next_review_at);

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to user_study_settings
DROP TRIGGER IF EXISTS update_user_study_settings_updated_at ON user_study_settings;
CREATE TRIGGER update_user_study_settings_updated_at
    BEFORE UPDATE ON user_study_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to user_problem_progress
DROP TRIGGER IF EXISTS update_user_problem_progress_updated_at ON user_problem_progress;
CREATE TRIGGER update_user_problem_progress_updated_at
    BEFORE UPDATE ON user_problem_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

