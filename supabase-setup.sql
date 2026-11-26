-- ==========================================
-- RESUMEVAULT: SUPABASE DATABASE SETUP
-- ==========================================

create extension if not exists pgcrypto;

-- 1. Create teams table
create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz default now()
);

-- 2. Create team members table
create table if not exists public.team_members (
    team_id uuid references public.teams(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    role text not null default 'recruiter'
        check (role in ('admin', 'recruiter')),
    created_at timestamptz default now(),
    primary key (team_id, user_id)
);

-- 3. Create candidates table
create table if not exists public.candidates (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id) on delete cascade,
    name text not null,
    domain text not null,
    experience text not null,
    location text not null,
    file_name text not null,
    file_path text not null,
    created_by uuid not null default auth.uid()
        references auth.users(id),
    created_at timestamptz default now()
);

create index if not exists candidates_team_created_idx
on public.candidates(team_id, created_at desc);

-- 4. Team membership security function
create or replace function public.is_team_member(check_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.team_members tm
        where tm.team_id = check_team_id
          and tm.user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;

-- 5. Enable Row Level Security
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.candidates enable row level security;

-- 6. Teams policies
drop policy if exists "Members can view their teams" on public.teams;

create policy "Members can view their teams"
on public.teams
for select
to authenticated
using (public.is_team_member(id));

-- 7. Team members policies
drop policy if exists "Users can view their own memberships" on public.team_members;

create policy "Users can view their own memberships"
on public.team_members
for select
to authenticated
using (user_id = (select auth.uid()));

-- 8. Candidate policies
drop policy if exists "Team members can view candidates" on public.candidates;

create policy "Team members can view candidates"
on public.candidates
for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "Team members can add candidates" on public.candidates;

create policy "Team members can add candidates"
on public.candidates
for insert
to authenticated
with check (
    public.is_team_member(team_id)
    and created_by = (select auth.uid())
);

drop policy if exists "Team members can update candidates" on public.candidates;

create policy "Team members can update candidates"
on public.candidates
for update
to authenticated
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "Team members can delete candidates" on public.candidates;

create policy "Team members can delete candidates"
on public.candidates
for delete
to authenticated
using (public.is_team_member(team_id));

-- 9. Grant database permissions
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select, insert, update, delete
on public.candidates to authenticated;

-- 10. Create private resume storage bucket
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'candidate-resumes',
    'candidate-resumes',
    false,
    15728640,
    array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 11. Storage security policies

drop policy if exists "Team members can view resume files"
on storage.objects;

create policy "Team members can view resume files"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'candidate-resumes'
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.team_id::text = (storage.foldername(name))[1]
    )
);

drop policy if exists "Team members can upload resume files"
on storage.objects;

create policy "Team members can upload resume files"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'candidate-resumes'
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.team_id::text = (storage.foldername(name))[1]
    )
);

drop policy if exists "Team members can delete resume files"
on storage.objects;

create policy "Team members can delete resume files"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'candidate-resumes'
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.team_id::text = (storage.foldername(name))[1]
    )
);

-- ==========================================
-- SETUP COMPLETE
-- ==========================================
