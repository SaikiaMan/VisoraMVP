# Supabase Setup Guide for Visora

## Overview
This authentication system uses Supabase for user registration and login management. User details are automatically saved to your Supabase database when they create an account.

## Steps to Setup

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in to your account
3. Click "New Project"
4. Enter a project name (e.g., "Visora MVP")
5. Set a strong database password
6. Choose your region (closest to your users)
7. Click "Create new project" and wait for it to initialize

### 2. Get Your Credentials
1. Go to Project Settings → API
2. Copy your **Project URL** (appears as SUPABASE_URL)
3. Copy your **anon public** key (appears as SUPABASE_ANON_KEY)
4. Keep these safe - don't commit them to public repositories

### 3. Update .env File
Edit `.env` in the root of your project and replace the placeholder values:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
```

### 4. Create Auth Table (Optional - Supabase Auto-Creates)
Supabase automatically handles user storage in the `auth.users` table. However, you can create a public profile table if needed:

1. Go to SQL Editor in Supabase
2. Run this query to create a profiles table:

```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id),
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
```

### 5. Test the Authentication
1. Start the server: `npm start`
2. Visit `http://localhost:3000`
3. Click "Sign Up" button
4. Try creating a new account or logging in
5. Check Supabase dashboard → Authentication → Users to see registered users

## Features Implemented

✅ **User Registration** - New users can create accounts with email and password
✅ **User Login** - Existing users can log in securely
✅ **User Data Storage** - Full names and emails are saved in Supabase
✅ **Session Management** - Auth sessions are validated on every request
✅ **Password Security** - Passwords are hashed by Supabase (bcrypt)

## Important Notes

- **Never commit .env to version control** - Add it to .gitignore
- **Keep your ANON_KEY safe** - It's only for client-side access and has limited permissions
- **Enable Email Confirmation** (optional):
  1. Go to Authentication → Providers → Email
  2. Toggle "Confirm email" for extra security
- **Custom Email Templates** (optional):
  1. Go to Authentication → Email Templates
  2. Customize confirmation and reset emails

## Environment Variables

```env
SUPABASE_URL=           # Your Supabase project URL
SUPABASE_ANON_KEY=      # Your public API key
```

## Troubleshooting

**"Error: Invalid API credentials"**
- Check that SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Ensure you copied the `anon` key, not the `service_role` key

**"User already exists"**
- The email is already registered
- Have the user use the Login form instead

**"Invalid password"**
- Password must be at least 6 characters
- Some special characters may require escaping

## Next Steps

1. ✅ Authentication is now ready
2. After user logs in, redirect them to the learning dashboard
3. Store user preferences (watched videos, notes, quizzes)
4. Implement profile management pages

---

**Questions?** Check [Supabase Docs](https://supabase.com/docs)
