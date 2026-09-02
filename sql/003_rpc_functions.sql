-- 003_rpc_functions.sql

CREATE OR REPLACE FUNCTION public.assign_warden_to_hostel(p_hostel_id uuid, p_warden_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    IF v_hostel_ids IS NULL THEN
        RETURN json_build_object(
            'total_rooms', 0,
            'occupied_rooms', 0,
            'vacant_rooms', 0,
            'total_capacity', 0,
            'open_complaints', 0,
            'pending_leaves', 0
        );
    END IF;

    SELECT COUNT(*), COALESCE(SUM(capacity), 0)
    INTO v_total_rooms, v_total_capacity 
    FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids);
    
    SELECT COUNT(*) INTO v_occupied_rooms FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids) AND occupied_count > 0;
    v_vacant_rooms := v_total_rooms - v_occupied_rooms;
    
    SELECT COUNT(*) INTO v_open_complaints FROM public.complaints 
    WHERE room_id IN (SELECT id FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids)) AND status <> 'resolved';
    
    SELECT COUNT(*) INTO v_pending_leaves FROM public.leave_requests 
    WHERE student_id IN (SELECT student_id FROM public.room_allocations WHERE room_id IN (SELECT id FROM public.rooms WHERE hostel_id = ANY(v_hostel_ids)) AND status = 'active') AND status = 'pending';

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
AS $$
DECLARE
    v_role text;
    v_is_valid boolean;
BEGIN
    v_role := public.get_my_role();
    IF v_role NOT IN ('admin', 'warden') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    IF v_role = 'warden' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.room_allocations ra
            JOIN public.rooms r ON ra.room_id = r.id
            JOIN public.hostels h ON r.hostel_id = h.id
            WHERE ra.student_id = p_student_id AND ra.status = 'active' AND h.warden_id = auth.uid()
        ) INTO v_is_valid;
        
        IF NOT v_is_valid THEN
            RAISE EXCEPTION 'Unauthorized for this student';
        END IF;
    END IF;
    
    INSERT INTO public.fee_payments (student_id, amount, due_date, status, recorded_by)
    VALUES (p_student_id, p_amount, p_due_date, p_status, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.review_leave_request(p_request_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_id uuid;
    v_is_valid_warden boolean;
BEGIN
    IF public.get_my_role() <> 'warden' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status';
    END IF;
    
    SELECT student_id INTO v_student_id FROM public.leave_requests WHERE id = p_request_id;
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;
    
    SELECT EXISTS (
        SELECT 1 FROM public.room_allocations ra
        JOIN public.rooms r ON ra.room_id = r.id
        JOIN public.hostels h ON r.hostel_id = h.id
        WHERE ra.student_id = v_student_id AND ra.status = 'active' AND h.warden_id = auth.uid()
    ) INTO v_is_valid_warden;
    
    IF NOT v_is_valid_warden THEN
        RAISE EXCEPTION 'Unauthorized for this student';
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
