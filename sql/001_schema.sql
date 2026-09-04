-- 001_schema.sql

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'warden', 'student')),
    phone text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hostels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text,
    warden_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hostel_wardens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
    warden_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (hostel_id, warden_id)
);

CREATE TABLE public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
    room_number text NOT NULL,
    floor int NOT NULL,
    capacity int NOT NULL CHECK (capacity > 0),
    occupied_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (hostel_id, room_number)
);

CREATE TABLE public.room_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    allocated_date date NOT NULL DEFAULT CURRENT_DATE,
    vacated_date date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacated'))
);

CREATE TABLE public.complaints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('maintenance', 'cleanliness', 'noise', 'other')),
    description text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE TABLE public.fee_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount numeric NOT NULL CHECK (amount > 0),
    due_date date NOT NULL,
    paid_date date,
    status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'overdue')),
    recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);

CREATE TABLE public.leave_requests (
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

CREATE TABLE public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id uuid REFERENCES public.hostels(id) ON DELETE CASCADE,
    posted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger functions

-- 1. handle_new_user
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. update_room_occupancy
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_allocation_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.room_allocations
    FOR EACH ROW EXECUTE FUNCTION public.update_room_occupancy();

-- 3. set_resolved_timestamp
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_complaint_update
    BEFORE UPDATE ON public.complaints
    FOR EACH ROW EXECUTE FUNCTION public.set_resolved_timestamp();

-- 4. handle_fee_paid_date
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_fee_payment_insert_update
    BEFORE INSERT OR UPDATE ON public.fee_payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_fee_paid_date();

-- 5. prevent_self_role_escalation
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger AS $$
BEGIN
    IF NEW.role <> OLD.role AND public.get_my_role() <> 'admin' THEN
        NEW.role := OLD.role;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prevent_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();
