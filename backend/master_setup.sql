-- ============================================================================
-- HOSTEL MANAGEMENT SYSTEM — MASTER SETUP (SCHEMA + RLS + RPC + SEED)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABLES & CONSTRAINTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'warden', 'student')),
    phone text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hostels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text,
    warden_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
    room_number text NOT NULL,
    floor int NOT NULL,
    capacity int NOT NULL CHECK (capacity > 0),
    occupied_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (hostel_id, room_number)
);

CREATE TABLE IF NOT EXISTS public.room_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    allocated_date date NOT NULL DEFAULT CURRENT_DATE,
    vacated_date date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacated'))
);

CREATE TABLE IF NOT EXISTS public.complaints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('maintenance', 'cleanliness', 'noise', 'other')),
    description text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount numeric NOT NULL CHECK (amount > 0),
    due_date date NOT NULL,
    paid_date date,
    status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'overdue')),
    recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    from_date date NOT NULL,
    to_date date NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (to_date >= from_date)
);

CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid REFERENCES public.hostels(id) ON DELETE CASCADE,
    posted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. AUTOMATIC TRIGGERS
-- ----------------------------------------------------------------------------

-- Trigger: Handle new user profile auto-creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'role', 'student')
    )
    ON CONFLICT (id) DO UPDATE
    SET role = COALESCE(EXCLUDED.role, profiles.role),
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Update room occupancy dynamically on allocation changes
CREATE OR REPLACE FUNCTION public.update_room_occupancy()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.rooms SET occupied_count = (SELECT COUNT(*) FROM public.room_allocations WHERE room_id = NEW.room_id AND status = 'active') WHERE id = NEW.room_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.rooms SET occupied_count = (SELECT COUNT(*) FROM public.room_allocations WHERE room_id = OLD.room_id AND status = 'active') WHERE id = OLD.room_id;
        IF OLD.room_id <> NEW.room_id THEN
            UPDATE public.rooms SET occupied_count = (SELECT COUNT(*) FROM public.room_allocations WHERE room_id = NEW.room_id AND status = 'active') WHERE id = NEW.room_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.rooms SET occupied_count = (SELECT COUNT(*) FROM public.room_allocations WHERE room_id = OLD.room_id AND status = 'active') WHERE id = OLD.room_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_room_allocation_changed ON public.room_allocations;
CREATE TRIGGER on_room_allocation_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.room_allocations
    FOR EACH ROW EXECUTE FUNCTION public.update_room_occupancy();

-- Trigger: Set/Reset resolved_at timestamp for 10-day auto-expiration
CREATE OR REPLACE FUNCTION public.set_resolved_timestamp()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
        NEW.resolved_at = now();
    ELSIF NEW.status <> 'resolved' THEN
        NEW.resolved_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS before_complaint_update ON public.complaints;
CREATE TRIGGER before_complaint_update
    BEFORE UPDATE ON public.complaints
    FOR EACH ROW EXECUTE FUNCTION public.set_resolved_timestamp();

-- ----------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS & RLS POLICIES
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
USING (
    id = auth.uid() OR 
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND id IN (SELECT public.get_warden_student_ids()))
);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid() OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
USING (public.get_my_role() = 'admin' OR id = auth.uid())
WITH CHECK (public.get_my_role() = 'admin' OR (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
USING (public.get_my_role() = 'admin');

-- Hostels Policies
DROP POLICY IF EXISTS "hostels_select" ON public.hostels;
CREATE POLICY "hostels_select" ON public.hostels FOR SELECT
USING (public.get_my_role() = 'admin' OR warden_id = auth.uid() OR id = public.get_my_allocated_hostel_id());

DROP POLICY IF EXISTS "hostels_insert" ON public.hostels;
CREATE POLICY "hostels_insert" ON public.hostels FOR INSERT
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostels_update" ON public.hostels;
CREATE POLICY "hostels_update" ON public.hostels FOR UPDATE
USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostels_delete" ON public.hostels;
CREATE POLICY "hostels_delete" ON public.hostels FOR DELETE
USING (public.get_my_role() = 'admin');

-- Rooms Policies
DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())) OR id = public.get_my_allocated_room_id());

DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT
WITH CHECK (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())));

DROP POLICY IF EXISTS "rooms_update" ON public.rooms;
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())));

DROP POLICY IF EXISTS "rooms_delete" ON public.rooms;
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())));

-- Room Allocations Policies
DROP POLICY IF EXISTS "room_allocations_select" ON public.room_allocations;
CREATE POLICY "room_allocations_select" ON public.room_allocations FOR SELECT
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())) OR student_id = auth.uid());

DROP POLICY IF EXISTS "room_allocations_insert" ON public.room_allocations;
CREATE POLICY "room_allocations_insert" ON public.room_allocations FOR INSERT
WITH CHECK (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())));

DROP POLICY IF EXISTS "room_allocations_update" ON public.room_allocations;
CREATE POLICY "room_allocations_update" ON public.room_allocations FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())));

DROP POLICY IF EXISTS "room_allocations_delete" ON public.room_allocations;
CREATE POLICY "room_allocations_delete" ON public.room_allocations FOR DELETE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())));

-- Complaints Policies
DROP POLICY IF EXISTS "complaints_select" ON public.complaints;
CREATE POLICY "complaints_select" ON public.complaints FOR SELECT
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())) OR student_id = auth.uid());

DROP POLICY IF EXISTS "complaints_insert" ON public.complaints;
CREATE POLICY "complaints_insert" ON public.complaints FOR INSERT
WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "complaints_update" ON public.complaints;
CREATE POLICY "complaints_update" ON public.complaints FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND room_id IN (SELECT public.get_warden_room_ids())));

-- Fee Payments Policies
DROP POLICY IF EXISTS "fee_payments_select" ON public.fee_payments;
CREATE POLICY "fee_payments_select" ON public.fee_payments FOR SELECT
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())) OR student_id = auth.uid());

DROP POLICY IF EXISTS "fee_payments_insert" ON public.fee_payments;
CREATE POLICY "fee_payments_insert" ON public.fee_payments FOR INSERT
WITH CHECK (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())));

DROP POLICY IF EXISTS "fee_payments_update" ON public.fee_payments;
CREATE POLICY "fee_payments_update" ON public.fee_payments FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())));

DROP POLICY IF EXISTS "fee_payments_delete" ON public.fee_payments;
CREATE POLICY "fee_payments_delete" ON public.fee_payments FOR DELETE
USING (public.get_my_role() = 'admin');

-- Leave Requests Policies
DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())) OR student_id = auth.uid());

DROP POLICY IF EXISTS "leave_requests_insert" ON public.leave_requests;
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT
WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND student_id IN (SELECT public.get_warden_student_ids())));

-- Announcements Policies
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    (public.get_my_role() = 'warden' AND (hostel_id IS NULL OR hostel_id IN (SELECT public.get_my_hostel_ids()))) OR 
    (public.get_my_role() = 'student' AND (hostel_id IS NULL OR hostel_id = public.get_my_allocated_hostel_id()))
);

DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
CREATE POLICY "announcements_insert" ON public.announcements FOR INSERT
WITH CHECK (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())));

DROP POLICY IF EXISTS "announcements_update" ON public.announcements;
CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE
USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'warden' AND hostel_id IN (SELECT public.get_my_hostel_ids())));

DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE
USING (public.get_my_role() = 'admin');

-- ----------------------------------------------------------------------------
-- 4. RPC FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_warden_to_hostel(p_hostel_id uuid, p_warden_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_my_role() <> 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    UPDATE public.hostels SET warden_id = p_warden_id WHERE id = p_hostel_id;
    UPDATE public.profiles SET role = 'warden' WHERE id = p_warden_id AND role <> 'warden';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_role(p_user_id uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_my_role() <> 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_new_role NOT IN ('admin', 'warden', 'student') THEN
        RAISE EXCEPTION 'Invalid role';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot change own role';
    END IF;
    UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_hostels int;
    v_total_rooms int;
    v_total_occupied int;
    v_total_capacity int;
    v_occupancy_percentage numeric;
    v_pending_complaints int;
    v_total_students int;
BEGIN
    IF public.get_my_role() <> 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT COUNT(*) INTO v_total_hostels FROM public.hostels;
    SELECT COUNT(*), COALESCE(SUM(occupied_count), 0), COALESCE(SUM(capacity), 0) 
    INTO v_total_rooms, v_total_occupied, v_total_capacity FROM public.rooms;
    
    IF v_total_capacity > 0 THEN
        v_occupancy_percentage := (v_total_occupied::numeric / v_total_capacity::numeric) * 100;
    ELSE
        v_occupancy_percentage := 0;
    END IF;
    
    SELECT COUNT(*) INTO v_pending_complaints FROM public.complaints WHERE status <> 'resolved';
    SELECT COUNT(*) INTO v_total_students FROM public.profiles WHERE role = 'student';
    
    RETURN json_build_object(
        'total_hostels', v_total_hostels,
        'total_rooms', v_total_rooms,
        'total_occupied', v_total_occupied,
        'total_capacity', v_total_capacity,
        'occupancy_percentage', ROUND(v_occupancy_percentage, 2),
        'occupancy_rate', ROUND(v_occupancy_percentage, 2),
        'pending_complaints', v_pending_complaints,
        'total_students', v_total_students
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_warden_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_rooms int;
    v_occupied_rooms int;
    v_vacant_rooms int;
    v_total_capacity int;
    v_open_complaints int;
    v_pending_leaves int;
    v_hostel_ids uuid[];
BEGIN
    IF public.get_my_role() <> 'warden' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT array_agg(id) INTO v_hostel_ids FROM public.hostels WHERE warden_id = auth.uid();
    
    IF v_hostel_ids IS NULL OR array_length(v_hostel_ids, 1) = 0 THEN
        RETURN json_build_object(
            'total_rooms', 0,
            'occupied_rooms', 0,
            'vacant_rooms', 0,
            'total_capacity', 0,
            'open_complaints', 0,
            'pending_leaves', 0
        );
    END IF;

    SELECT COUNT(*), COALESCE(SUM(capacity), 0) INTO v_total_rooms, v_total_capacity FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids);
    SELECT COUNT(*) INTO v_occupied_rooms FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids) AND occupied_count > 0;
    v_vacant_rooms := v_total_rooms - v_occupied_rooms;

    SELECT COUNT(*) INTO v_open_complaints 
    FROM public.complaints c
    JOIN public.rooms r ON c.room_id = r.id
    WHERE r.hostel_id = ANY(v_hostel_ids) AND c.status <> 'resolved';

    SELECT COUNT(*) INTO v_pending_leaves
    FROM public.leave_requests lr
    JOIN public.room_allocations ra ON lr.student_id = ra.student_id
    JOIN public.rooms r ON ra.room_id = r.id
    WHERE r.hostel_id = ANY(v_hostel_ids) AND ra.status = 'active' AND lr.status = 'pending';

    RETURN json_build_object(
        'total_rooms', v_total_rooms,
        'occupied_rooms', v_occupied_rooms,
        'vacant_rooms', v_vacant_rooms,
        'total_capacity', v_total_capacity,
        'open_complaints', v_open_complaints,
        'pending_leaves', v_pending_leaves
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_fee_record(p_student_id uuid, p_amount numeric, p_due_date date, p_status text DEFAULT 'due')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_my_role() NOT IN ('admin', 'warden') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    INSERT INTO public.fee_payments (student_id, amount, due_date, status, recorded_by)
    VALUES (p_student_id, p_amount, p_due_date, p_status, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.review_leave_request(p_request_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_my_role() NOT IN ('admin', 'warden') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    UPDATE public.leave_requests 
    SET status = p_status, reviewed_by = auth.uid()
    WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_roommates()
RETURNS TABLE (full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_room_id uuid;
BEGIN
    SELECT room_id INTO v_room_id 
    FROM public.room_allocations 
    WHERE student_id = auth.uid() AND status = 'active'
    LIMIT 1;

    IF v_room_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.full_name
    FROM public.room_allocations ra
    JOIN public.profiles p ON ra.student_id = p.id
    WHERE ra.room_id = v_room_id 
      AND ra.status = 'active' 
      AND ra.student_id <> auth.uid();
END;
$$;
