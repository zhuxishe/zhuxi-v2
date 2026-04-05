-- Phase 2: Admin interview system

-- Add interview columns to members
alter table public.members
  add column interview_date date,
  add column interviewer text,
  add column attractiveness_score int check (attractiveness_score between 1 and 5);

-- Admin users
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now()
);

-- Interview evaluations (17 scoring dimensions + meta)
create table public.interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  interviewer_id uuid references public.admin_users(id),
  -- 17 scoring dimensions (1-5 scale)
  communication int not null check (communication between 1 and 5),
  articulation int not null check (articulation between 1 and 5),
  enthusiasm int not null check (enthusiasm between 1 and 5),
  sincerity int not null check (sincerity between 1 and 5),
  social_comfort int not null check (social_comfort between 1 and 5),
  humor int not null check (humor between 1 and 5),
  emotional_stability int not null check (emotional_stability between 1 and 5),
  boundary_respect int not null check (boundary_respect between 1 and 5),
  team_orientation int not null check (team_orientation between 1 and 5),
  interest_alignment int not null check (interest_alignment between 1 and 5),
  japanese_ability int not null check (japanese_ability between 1 and 5),
  time_commitment int not null check (time_commitment between 1 and 5),
  leadership_potential int not null check (leadership_potential between 1 and 5),
  openness int not null check (openness between 1 and 5),
  responsibility int not null check (responsibility between 1 and 5),
  first_impression int not null check (first_impression between 1 and 5),
  overall_recommendation int not null check (overall_recommendation between 1 and 5),
  -- Meta
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  risk_notes text,
  interviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger interview_evaluations_updated_at
  before update on public.interview_evaluations
  for each row execute function public.update_updated_at();

-- RLS
alter table public.admin_users enable row level security;
alter table public.interview_evaluations enable row level security;

-- Admin policies
create policy "admin_read_members" on public.members for select to authenticated using (true);
create policy "admin_update_members" on public.members for update to authenticated using (true);
create policy "admin_read_identity" on public.member_identity for select to authenticated using (true);
create policy "admin_read_admin_users" on public.admin_users for select to authenticated using (true);
create policy "admin_insert_evaluations" on public.interview_evaluations for insert to authenticated with check (true);
create policy "admin_read_evaluations" on public.interview_evaluations for select to authenticated using (true);
create policy "admin_update_evaluations" on public.interview_evaluations for update to authenticated using (true);

-- Indexes
create index idx_interview_eval_member on public.interview_evaluations(member_id);
create index idx_admin_users_user_id on public.admin_users(user_id);
