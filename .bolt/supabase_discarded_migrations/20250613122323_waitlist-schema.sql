-- Waitlist table for email signups
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow anonymous users to insert emails (for signup)
CREATE POLICY "Allow anonymous email signup" ON waitlist
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- RLS Policy: Allow anonymous users to select emails (for duplicate checking)
CREATE POLICY "Allow anonymous email check" ON waitlist
  FOR SELECT 
  TO anon
  USING (true);

-- RLS Policy: Allow authenticated users to view all waitlist entries (for admin purposes)
CREATE POLICY "Allow authenticated users to view waitlist" ON waitlist
  FOR SELECT 
  TO authenticated
  USING (true);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Create index on signed_up_at for sorting
CREATE INDEX IF NOT EXISTS idx_waitlist_signed_up_at ON waitlist(signed_up_at);
