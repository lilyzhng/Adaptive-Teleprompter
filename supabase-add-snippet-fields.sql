-- Add missing fields to saved_items table
-- This allows users to save complete snippet information for rehearsal practice

-- Add category field (e.g., "Pace", "Clarity", "Structure")
ALTER TABLE saved_items 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Add rewrite field (the improved version for improvements/drills)
ALTER TABLE saved_items 
ADD COLUMN IF NOT EXISTS rewrite TEXT;

-- Add explanation field (why the rewrite works - for improvements)
ALTER TABLE saved_items 
ADD COLUMN IF NOT EXISTS explanation TEXT;

-- Add question field (the original interview question for rehearsal)
ALTER TABLE saved_items 
ADD COLUMN IF NOT EXISTS question TEXT;

-- Add human_rewrite field (AI recommended human-like rewrite for speaking practice)
ALTER TABLE saved_items 
ADD COLUMN IF NOT EXISTS human_rewrite TEXT;

-- Optional: Add an index for better query performance
CREATE INDEX IF NOT EXISTS idx_saved_items_user_type ON saved_items(user_id, type);

-- Display current schema to verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'saved_items'
ORDER BY ordinal_position;
