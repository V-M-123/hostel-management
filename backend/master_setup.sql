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

CREATE TABLE IF NOT EXISTS public.hostel_wardens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
    warden_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (hostel_id, warden_id)
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

-- Trigger: Auto-manage paid_date on fee status changes
CREATE OR REPLACE FUNCTION public.handle_fee_paid_date()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'paid' AND NEW.paid_date IS NULL THEN
        NEW.paid_date := CURRENT_DATE;
    ELSIF NEW.status IN ('due', 'overdue') THEN
        NEW.paid_date := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS before_fee_payment_insert_update ON public.fee_payments;
CREATE TRIGGER before_fee_payment_insert_update
    BEFORE INSERT OR UPDATE ON public.fee_payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_fee_paid_date();

-- Trigger: Prevent regular users from self-escalating role
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger AS $$
BEGIN
    IF NEW.role <> OLD.role AND public.get_my_role() <> 'admin' THEN
        NEW.role := OLD.role;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

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
  RETURN COALESCE(v_role, 'student');
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
    RETURN QUERY 
    SELECT id FROM public.hostels WHERE warden_id = auth.uid()
    UNION
    SELECT hostel_id FROM public.hostel_wardens WHERE warden_id = auth.uid();
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
    WHERE r.hostel_id IN (SELECT public.get_my_hostel_ids());
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
    WHERE r.hostel_id IN (SELECT public.get_my_hostel_ids()) AND ra.status = 'active';
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
ALTER TABLE public.hostel_wardens ENABLE ROW LEVEL SECURITY;
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
USING (
    id = auth.uid() OR 
    public.get_my_role() = 'admin'
)
WITH CHECK (
    id = auth.uid() OR 
    public.get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
USING (public.get_my_role() = 'admin');

-- Hostels Policies
DROP POLICY IF EXISTS "hostels_select" ON public.hostels;
CREATE POLICY "hostels_select" ON public.hostels FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    warden_id = auth.uid() OR 
    id IN (SELECT public.get_my_hostel_ids()) OR 
    id = public.get_my_allocated_hostel_id()
);

DROP POLICY IF EXISTS "hostels_insert" ON public.hostels;
CREATE POLICY "hostels_insert" ON public.hostels FOR INSERT
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostels_update" ON public.hostels;
CREATE POLICY "hostels_update" ON public.hostels FOR UPDATE
USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostels_delete" ON public.hostels;
CREATE POLICY "hostels_delete" ON public.hostels FOR DELETE
USING (public.get_my_role() = 'admin');

-- Hostel Wardens Policies (1:M / M:N Junction Table)
DROP POLICY IF EXISTS "hostel_wardens_select" ON public.hostel_wardens;
CREATE POLICY "hostel_wardens_select" ON public.hostel_wardens FOR SELECT
USING (
    public.get_my_role() = 'admin' OR 
    warden_id = auth.uid() OR 
    hostel_id = public.get_my_allocated_hostel_id()
);

DROP POLICY IF EXISTS "hostel_wardens_insert" ON public.hostel_wardens;
CREATE POLICY "hostel_wardens_insert" ON public.hostel_wardens FOR INSERT
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostel_wardens_update" ON public.hostel_wardens;
CREATE POLICY "hostel_wardens_update" ON public.hostel_wardens FOR UPDATE
USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "hostel_wardens_delete" ON public.hostel_wardens;
CREATE POLICY "hostel_wardens_delete" ON public.hostel_wardens FOR DELETE
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
    
    INSERT INTO public.hostel_wardens (hostel_id, warden_id)
    VALUES (p_hostel_id, p_warden_id)
    ON CONFLICT (hostel_id, warden_id) DO NOTHING;

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

    SELECT array_agg(id) INTO v_hostel_ids FROM (
        SELECT public.get_my_hostel_ids() AS id
    ) sub;
    
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

CREATE OR REPLACE FUNCTION public.create_fee_record(
    p_student_id uuid, 
    p_amount numeric, 
    p_due_date date, 
    p_status text DEFAULT 'due',
    p_paid_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_my_role() NOT IN ('admin', 'warden') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    INSERT INTO public.fee_payments (student_id, amount, due_date, status, paid_date, recorded_by)
    VALUES (
        p_student_id, 
        p_amount, 
        p_due_date, 
        p_status, 
        CASE WHEN p_status = 'paid' THEN COALESCE(p_paid_date, CURRENT_DATE) ELSE NULL END, 
        auth.uid()
    );
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

-- RPC Function for capacity-aware random allocation
CREATE OR REPLACE FUNCTION public.random_allocate_students(
    p_hostel_id uuid DEFAULT NULL,
    p_max_count int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_allocated_count int := 0;
    v_student_rec RECORD;
    v_room_id uuid;
    v_cursor CURSOR FOR
        SELECT id FROM public.profiles
        WHERE role = 'student'
          AND id NOT IN (
              SELECT student_id FROM public.room_allocations WHERE status = 'active'
          )
        ORDER BY random();
BEGIN
    IF public.get_my_role() NOT IN ('admin', 'warden') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF public.get_my_role() = 'warden' THEN
        IF p_hostel_id IS NOT NULL AND p_hostel_id NOT IN (SELECT public.get_my_hostel_ids()) THEN
            RAISE EXCEPTION 'Unauthorized for this hostel block';
        END IF;
    END IF;

    FOR v_student_rec IN v_cursor LOOP
        IF p_max_count IS NOT NULL AND v_allocated_count >= p_max_count THEN
            EXIT;
        END IF;

        -- Find a random room with available capacity (capacity > occupied_count)
        SELECT r.id INTO v_room_id
        FROM public.rooms r
        WHERE (p_hostel_id IS NULL OR r.hostel_id = p_hostel_id)
          AND (public.get_my_role() = 'admin' OR r.hostel_id IN (SELECT public.get_my_hostel_ids()))
          AND r.capacity > (
              SELECT COUNT(*) FROM public.room_allocations ra WHERE ra.room_id = r.id AND ra.status = 'active'
          )
        ORDER BY random()
        LIMIT 1;

        IF v_room_id IS NOT NULL THEN
            INSERT INTO public.room_allocations (room_id, student_id, allocated_date, status)
            VALUES (v_room_id, v_student_rec.id, CURRENT_DATE, 'active');
            v_allocated_count := v_allocated_count + 1;
        END IF;
    END LOOP;

    RETURN json_build_object('allocated_count', v_allocated_count);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SEED DATA (4 Hostels, 20 Wardens [5 per Hostel], 3 Admins, 200 Students)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    -- 4 Hostels
    v_hostel_a uuid := gen_random_uuid();
    v_hostel_b uuid := gen_random_uuid();
    v_hostel_c uuid := gen_random_uuid();
    v_hostel_d uuid := gen_random_uuid();

    -- Admins
    v_admin_1 uuid := gen_random_uuid();
    v_admin_2 uuid := gen_random_uuid();
    v_admin_3 uuid := gen_random_uuid();

    -- Arrays for iteration
    hostel_ids uuid[] := ARRAY[v_hostel_a, v_hostel_b, v_hostel_c, v_hostel_d];
    hostel_codes text[] := ARRAY['A', 'B', 'C', 'D'];
    hostel_names text[] := ARRAY['Block A - North Wing (Boys)', 'Block B - South Wing (Girls)', 'Block C - East Wing (Co-ed)', 'Block D - West Wing (International)'];
    hostel_addresses text[] := ARRAY['North Campus, Sector 1', 'South Campus, Sector 4', 'East Campus, Sector 2', 'West Campus, Sector 5'];

    h_idx int;
    w_idx int;
    s_idx int;
    fl_idx int;
    rm_idx int;

    v_warden_id uuid;
    v_student_id uuid;
    v_room_id uuid;
    v_room_number text;
    v_primary_warden uuid;
BEGIN
    -- 1. Clean existing records (Optional reset for seed consistency)
    DELETE FROM public.announcements;
    DELETE FROM public.leave_requests;
    DELETE FROM public.complaints;
    DELETE FROM public.fee_payments;
    DELETE FROM public.room_allocations;
    DELETE FROM public.rooms;
    DELETE FROM public.hostel_wardens;
    DELETE FROM public.hostels;
    DELETE FROM public.profiles;

    -- 2. Create 3 Admins
    INSERT INTO public.profiles (id, full_name, role, phone)
    VALUES 
        (v_admin_1, 'Dr. Rajesh Sharma', 'admin', '+91 9811100001'),
        (v_admin_2, 'Prof. Sunita Rao', 'admin', '+91 9811100002'),
        (v_admin_3, 'Mr. Amit Verma', 'admin', '+91 9811100003')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

    -- 3. Create 4 Hostels & 20 Wardens (5 Wardens per Hostel)
    FOR h_idx IN 1..4 LOOP
        FOR w_idx IN 1..5 LOOP
            v_warden_id := gen_random_uuid();
            
            INSERT INTO public.profiles (id, full_name, role, phone)
            VALUES (
                v_warden_id, 
                'Warden ' || hostel_codes[h_idx] || '-' || w_idx || ' (' || split_part(hostel_names[h_idx], ' ', 2) || ')', 
                'warden', 
                '+91 98222' || lpad((h_idx * 10 + w_idx)::text, 5, '0')
            )
            ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

            IF w_idx = 1 THEN
                v_primary_warden := v_warden_id;
                INSERT INTO public.hostels (id, name, address, warden_id)
                VALUES (hostel_ids[h_idx], hostel_names[h_idx], hostel_addresses[h_idx], v_primary_warden);
            END IF;

            INSERT INTO public.hostel_wardens (hostel_id, warden_id)
            VALUES (hostel_ids[h_idx], v_warden_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- 4. Create Rooms (25 rooms with capacity 2 = 50 students per hostel)
    FOR h_idx IN 1..4 LOOP
        FOR fl_idx IN 1..5 LOOP
            FOR rm_idx IN 1..5 LOOP
                v_room_number := hostel_codes[h_idx] || fl_idx || '0' || rm_idx;
                
                INSERT INTO public.rooms (id, hostel_id, room_number, floor, capacity, occupied_count)
                VALUES (gen_random_uuid(), hostel_ids[h_idx], v_room_number, fl_idx, 2, 2);
            END LOOP;
        END LOOP;
    END LOOP;

    -- 5. Create 50 Students in each hostel (200 Students Total) & Allocate Rooms
    FOR h_idx IN 1..4 LOOP
        s_idx := 1;
        FOR fl_idx IN 1..5 LOOP
            FOR rm_idx IN 1..5 LOOP
                v_room_number := hostel_codes[h_idx] || fl_idx || '0' || rm_idx;
                
                SELECT id INTO v_room_id FROM public.rooms 
                WHERE hostel_id = hostel_ids[h_idx] AND room_number = v_room_number;

                -- Allocate Bed 1
                v_student_id := gen_random_uuid();
                INSERT INTO public.profiles (id, full_name, role, phone)
                VALUES (
                    v_student_id, 
                    'Student ' || hostel_codes[h_idx] || '-' || lpad(s_idx::text, 2, '0') || ' (' || hostel_codes[h_idx] || ')', 
                    'student', 
                    '+91 97' || lpad(h_idx::text, 2, '0') || lpad(s_idx::text, 6, '0')
                )
                ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

                INSERT INTO public.room_allocations (room_id, student_id, allocated_date, status)
                VALUES (v_room_id, v_student_id, CURRENT_DATE - (s_idx * 2), 'active');

                -- Add fee records & sample complaints / leaves
                INSERT INTO public.fee_payments (student_id, amount, due_date, paid_date, status, recorded_by)
                VALUES (
                    v_student_id, 
                    15000.00, 
                    CURRENT_DATE + 30, 
                    CASE WHEN s_idx % 2 = 0 THEN CURRENT_DATE - 5 ELSE NULL END, 
                    CASE WHEN s_idx % 2 = 0 THEN 'paid' ELSE 'due' END, 
                    (SELECT warden_id FROM public.hostels WHERE id = hostel_ids[h_idx])
                );

                IF s_idx % 5 = 0 THEN
                    INSERT INTO public.complaints (student_id, room_id, category, description, status, created_at)
                    VALUES (
                        v_student_id, 
                        v_room_id, 
                        CASE (s_idx % 4) 
                            WHEN 0 THEN 'maintenance' 
                            WHEN 1 THEN 'cleanliness' 
                            WHEN 2 THEN 'noise' 
                            ELSE 'other' 
                        END, 
                        'Issue reported for room ' || v_room_number || ': Regular checkup required.', 
                        CASE WHEN s_idx % 10 = 0 THEN 'resolved' ELSE 'open' END,
                        now() - (s_idx || ' hours')::interval
                    );
                END IF;

                IF s_idx % 7 = 0 THEN
                    INSERT INTO public.leave_requests (student_id, from_date, to_date, reason, status, reviewed_by)
                    VALUES (
                        v_student_id, 
                        CURRENT_DATE + 2, 
                        CURRENT_DATE + 5, 
                        'Family function visit', 
                        CASE WHEN s_idx % 14 = 0 THEN 'approved' ELSE 'pending' END, 
                        (SELECT warden_id FROM public.hostels WHERE id = hostel_ids[h_idx])
                    );
                END IF;

                s_idx := s_idx + 1;

                -- Allocate Bed 2
                v_student_id := gen_random_uuid();
                INSERT INTO public.profiles (id, full_name, role, phone)
                VALUES (
                    v_student_id, 
                    'Student ' || hostel_codes[h_idx] || '-' || lpad(s_idx::text, 2, '0') || ' (' || hostel_codes[h_idx] || ')', 
                    'student', 
                    '+91 97' || lpad(h_idx::text, 2, '0') || lpad(s_idx::text, 6, '0')
                )
                ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

                INSERT INTO public.room_allocations (room_id, student_id, allocated_date, status)
                VALUES (v_room_id, v_student_id, CURRENT_DATE - (s_idx * 2), 'active');

                INSERT INTO public.fee_payments (student_id, amount, due_date, paid_date, status, recorded_by)
                VALUES (
                    v_student_id, 
                    15000.00, 
                    CURRENT_DATE + 30, 
                    CURRENT_DATE - 2, 
                    'paid', 
                    (SELECT warden_id FROM public.hostels WHERE id = hostel_ids[h_idx])
                );

                s_idx := s_idx + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    -- 6. Create Announcements for each hostel
    FOR h_idx IN 1..4 LOOP
        SELECT warden_id INTO v_primary_warden FROM public.hostels WHERE id = hostel_ids[h_idx];
        
        INSERT INTO public.announcements (hostel_id, posted_by, title, message)
        VALUES 
            (hostel_ids[h_idx], v_primary_warden, 'Welcome to ' || split_part(hostel_names[h_idx], ' - ', 1), 'Please make sure to review the hostel rules and guidelines for this semester.'),
            (hostel_ids[h_idx], v_primary_warden, 'Maintenance Schedule', 'Routine plumbing and electrical maintenance is scheduled for this upcoming Saturday.');
    END LOOP;
END;
$$;
