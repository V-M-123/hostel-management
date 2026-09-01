-- 002_rls_policies.sql

-- 1. Helper Functions (SECURITY DEFINER with fixed search_path to prevent recursion)

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_hostel_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY SELECT id FROM public.hostels WHERE warden_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warden_room_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT r.id
    FROM public.rooms r
    JOIN public.hostels h ON r.hostel_id = h.id
    WHERE h.warden_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warden_student_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT ra.student_id
    FROM public.room_allocations ra
    JOIN public.rooms r ON ra.room_id = r.id
    JOIN public.hostels h ON r.hostel_id = h.id
    WHERE h.warden_id = auth.uid() AND ra.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_allocated_room_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_room_id uuid;
BEGIN
    SELECT room_id INTO v_room_id 
    FROM public.room_allocations 
    WHERE student_id = auth.uid() AND status = 'active'
    LIMIT 1;
    RETURN v_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_allocated_hostel_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_hostel_id uuid;
BEGIN
    SELECT r.hostel_id INTO v_hostel_id
    FROM public.room_allocations ra
    JOIN public.rooms r ON ra.room_id = r.id
    WHERE ra.student_id = auth.uid() AND ra.status = 'active'
    LIMIT 1;
    RETURN v_hostel_id;
END;
$$;

-- 2. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 3. Drop all existing policies to ensure clean state
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

DROP POLICY IF EXISTS "hostels_select" ON public.hostels;
DROP POLICY IF EXISTS "hostels_insert" ON public.hostels;
DROP POLICY IF EXISTS "hostels_update" ON public.hostels;
DROP POLICY IF EXISTS "hostels_delete" ON public.hostels;

DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_update" ON public.rooms;
DROP POLICY IF EXISTS "rooms_delete" ON public.rooms;

DROP POLICY IF EXISTS "room_allocations_select" ON public.room_allocations;
DROP POLICY IF EXISTS "room_allocations_insert" ON public.room_allocations;
DROP POLICY IF EXISTS "room_allocations_update" ON public.room_allocations;
DROP POLICY IF EXISTS "room_allocations_delete" ON public.room_allocations;

DROP POLICY IF EXISTS "complaints_select" ON public.complaints;
DROP POLICY IF EXISTS "complaints_insert" ON public.complaints;
DROP POLICY IF EXISTS "complaints_update" ON public.complaints;

DROP POLICY IF EXISTS "fee_payments_select" ON public.fee_payments;
DROP POLICY IF EXISTS "fee_payments_insert" ON public.fee_payments;
DROP POLICY IF EXISTS "fee_payments_update" ON public.fee_payments;
DROP POLICY IF EXISTS "fee_payments_delete" ON public.fee_payments;

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;

DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
DROP POLICY IF EXISTS "announcements_update" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;

-- 4. Clean Non-Recursive RLS Policies

-- profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
USING (
    id = auth.uid() OR 
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND id IN (SELECT public.get_warden_student_ids()))
);

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
USING (
    public.get_my_role() = 'admin' OR id = auth.uid()
)
WITH CHECK (
    public.get_my_role() = 'admin' OR (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
);

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
USING (public.get_my_role() = 'admin');

-- hostels
CREATE POLICY "hostels_select" ON public.hostels FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    warden_id = auth.uid() OR 
    id = public.get_my_allocated_hostel_id()
);

CREATE POLICY "hostels_insert" ON public.hostels FOR INSERT
WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "hostels_update" ON public.hostels FOR UPDATE
USING (public.get_my_role() = 'admin');

CREATE POLICY "hostels_delete" ON public.hostels FOR DELETE
USING (public.get_my_role() = 'admin');

-- rooms
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())) OR 
    id = public.get_my_allocated_room_id()
);

CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT
WITH CHECK (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);

CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);

CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);

-- room_allocations
CREATE POLICY "room_allocations_select" ON public.room_allocations FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())) OR 
    student_id = auth.uid()
);

CREATE POLICY "room_allocations_insert" ON public.room_allocations FOR INSERT
WITH CHECK (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids()))
);

CREATE POLICY "room_allocations_update" ON public.room_allocations FOR UPDATE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids()))
);

CREATE POLICY "room_allocations_delete" ON public.room_allocations FOR DELETE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids()))
);

-- complaints
CREATE POLICY "complaints_select" ON public.complaints FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())) OR 
    student_id = auth.uid()
);

CREATE POLICY "complaints_insert" ON public.complaints FOR INSERT
WITH CHECK (student_id = auth.uid());

CREATE POLICY "complaints_update" ON public.complaints FOR UPDATE
USING (
    public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())
);

-- fee_payments
CREATE POLICY "fee_payments_select" ON public.fee_payments FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())) OR 
    student_id = auth.uid()
);

CREATE POLICY "fee_payments_insert" ON public.fee_payments FOR INSERT
WITH CHECK (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids()))
);

CREATE POLICY "fee_payments_update" ON public.fee_payments FOR UPDATE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids()))
);

CREATE POLICY "fee_payments_delete" ON public.fee_payments FOR DELETE
USING (public.get_my_role() = 'admin');

-- leave_requests
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())) OR 
    student_id = auth.uid()
);

CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT
WITH CHECK (student_id = auth.uid());

CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE
USING (
    public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())
);

-- announcements
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND (hostel_id IS NULL OR hostel_id IN (SELECT public.get_my_hostel_ids()))) OR 
    (public.get_my_role() = 'student' AND (hostel_id IS NULL OR hostel_id = public.get_my_allocated_hostel_id()))
);

CREATE POLICY "announcements_insert" ON public.announcements FOR INSERT
WITH CHECK (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);

CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);

CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids()))
);
