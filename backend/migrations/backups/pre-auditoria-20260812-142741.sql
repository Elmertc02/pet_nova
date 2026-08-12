--
-- PostgreSQL database dump
--

\restrict kgDnNxoJqW3cmt9JmDPBZV3A8Ui6oSEJUa1JRvXW85F5YNKsbnKMFbsAZ7FH6m3

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: botellas; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.botellas (
    id integer NOT NULL,
    maquina text NOT NULL,
    cod_bot text NOT NULL,
    cod_pref text,
    gramaje real,
    volumen real,
    cliente text,
    descripcion text,
    color text,
    u_bolsa text,
    u_pallet text,
    velocidad text,
    rosca text,
    moldes text
);


ALTER TABLE public.botellas OWNER TO etiquetas2_app;

--
-- Name: cajas_preforma; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.cajas_preforma (
    id integer NOT NULL,
    cod_preforma text NOT NULL,
    num_caja text NOT NULL,
    op text DEFAULT ''::text NOT NULL,
    resina text DEFAULT ''::text NOT NULL,
    cantidad_inicial integer DEFAULT 0 NOT NULL,
    cantidad_actual integer DEFAULT 0 NOT NULL,
    fecha_ingreso text NOT NULL,
    fecha_vaciada text,
    estado text DEFAULT 'activa'::text NOT NULL,
    observaciones text DEFAULT ''::text NOT NULL,
    usuario text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    updated_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.cajas_preforma OWNER TO etiquetas2_app;

--
-- Name: cajas_preforma_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.cajas_preforma_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cajas_preforma_id_seq OWNER TO etiquetas2_app;

--
-- Name: cajas_preforma_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.cajas_preforma_id_seq OWNED BY public.cajas_preforma.id;


--
-- Name: cajas_preforma_mov; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.cajas_preforma_mov (
    id integer NOT NULL,
    caja_id integer NOT NULL,
    reporte_id integer NOT NULL,
    cantidad integer NOT NULL,
    fecha text,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    estado text DEFAULT 'ninguno'::text NOT NULL,
    cantidad_irregular integer DEFAULT 0 NOT NULL,
    saldo_anterior integer DEFAULT 0 NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.cajas_preforma_mov OWNER TO etiquetas2_app;

--
-- Name: cajas_preforma_mov_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.cajas_preforma_mov_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cajas_preforma_mov_id_seq OWNER TO etiquetas2_app;

--
-- Name: cajas_preforma_mov_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.cajas_preforma_mov_id_seq OWNED BY public.cajas_preforma_mov.id;


--
-- Name: dig_usuarios; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.dig_usuarios (
    id integer NOT NULL,
    nombre text NOT NULL,
    username text NOT NULL,
    rol text DEFAULT 'visor'::text NOT NULL,
    activo integer DEFAULT 1 NOT NULL,
    creado_en text
);


ALTER TABLE public.dig_usuarios OWNER TO etiquetas2_app;

--
-- Name: etiquetas_entries; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.etiquetas_entries (
    id integer NOT NULL,
    orden_op text NOT NULL,
    maquina_id integer,
    maquina_nombre text DEFAULT ''::text NOT NULL,
    maquina_letra text DEFAULT ''::text NOT NULL,
    fecha text NOT NULL,
    turno text DEFAULT ''::text NOT NULL,
    cod_botella text DEFAULT ''::text NOT NULL,
    cod_preforma text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.etiquetas_entries OWNER TO etiquetas2_app;

--
-- Name: etiquetas_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.etiquetas_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.etiquetas_entries_id_seq OWNER TO etiquetas2_app;

--
-- Name: etiquetas_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.etiquetas_entries_id_seq OWNED BY public.etiquetas_entries.id;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.machines (
    id integer NOT NULL,
    nombre text NOT NULL,
    letra text DEFAULT ''::text NOT NULL,
    tipo text DEFAULT 'ambos'::text NOT NULL,
    activa integer DEFAULT 1 NOT NULL,
    orden integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.machines OWNER TO etiquetas2_app;

--
-- Name: machines_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.machines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.machines_id_seq OWNER TO etiquetas2_app;

--
-- Name: machines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.machines_id_seq OWNED BY public.machines.id;


--
-- Name: personal; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.personal (
    id integer NOT NULL,
    nombre text NOT NULL,
    rol text DEFAULT 'operador'::text NOT NULL,
    activo integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.personal OWNER TO etiquetas2_app;

--
-- Name: personal_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.personal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.personal_id_seq OWNER TO etiquetas2_app;

--
-- Name: personal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.personal_id_seq OWNED BY public.personal.id;


--
-- Name: planes; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.planes (
    id integer NOT NULL,
    semana text NOT NULL,
    maquina text NOT NULL,
    datos text DEFAULT '{}'::text NOT NULL,
    fecha text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.planes OWNER TO etiquetas2_app;

--
-- Name: planes_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.planes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planes_id_seq OWNER TO etiquetas2_app;

--
-- Name: planes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.planes_id_seq OWNED BY public.planes.id;


--
-- Name: planificacion_adiciones; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.planificacion_adiciones (
    id integer NOT NULL,
    semana text NOT NULL,
    maquina text NOT NULL,
    cod_bot text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    cantidad integer DEFAULT 0 NOT NULL,
    vel real DEFAULT 0 NOT NULL,
    despues_de text DEFAULT ''::text NOT NULL,
    notas text DEFAULT ''::text NOT NULL,
    submaq text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.planificacion_adiciones OWNER TO etiquetas2_app;

--
-- Name: planificacion_adiciones_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.planificacion_adiciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planificacion_adiciones_id_seq OWNER TO etiquetas2_app;

--
-- Name: planificacion_adiciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.planificacion_adiciones_id_seq OWNED BY public.planificacion_adiciones.id;


--
-- Name: planificacion_historial; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.planificacion_historial (
    id integer NOT NULL,
    semana text NOT NULL,
    maquina text NOT NULL,
    datos text DEFAULT '{}'::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.planificacion_historial OWNER TO etiquetas2_app;

--
-- Name: planificacion_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.planificacion_historial_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planificacion_historial_id_seq OWNER TO etiquetas2_app;

--
-- Name: planificacion_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.planificacion_historial_id_seq OWNED BY public.planificacion_historial.id;


--
-- Name: planificacion_paros; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.planificacion_paros (
    id integer NOT NULL,
    semana text NOT NULL,
    maquina text NOT NULL,
    dia_idx integer NOT NULL,
    dia_nombre text DEFAULT ''::text NOT NULL,
    horas real DEFAULT 0 NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.planificacion_paros OWNER TO etiquetas2_app;

--
-- Name: planificacion_paros_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.planificacion_paros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planificacion_paros_id_seq OWNER TO etiquetas2_app;

--
-- Name: planificacion_paros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.planificacion_paros_id_seq OWNED BY public.planificacion_paros.id;


--
-- Name: planificacion_reasignaciones; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.planificacion_reasignaciones (
    id integer NOT NULL,
    semana text NOT NULL,
    maq_origen text NOT NULL,
    maq_destino text NOT NULL,
    cod_bot text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    cantidad integer DEFAULT 0 NOT NULL,
    vel real DEFAULT 0 NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.planificacion_reasignaciones OWNER TO etiquetas2_app;

--
-- Name: planificacion_reasignaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.planificacion_reasignaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planificacion_reasignaciones_id_seq OWNER TO etiquetas2_app;

--
-- Name: planificacion_reasignaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.planificacion_reasignaciones_id_seq OWNED BY public.planificacion_reasignaciones.id;


--
-- Name: preformas; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.preformas (
    id integer NOT NULL,
    codigo text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    unid_caja integer DEFAULT 0 NOT NULL,
    gramaje real
);


ALTER TABLE public.preformas OWNER TO etiquetas2_app;

--
-- Name: reportes_diarios; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.reportes_diarios (
    id integer NOT NULL,
    orden_op text NOT NULL,
    fecha text NOT NULL,
    turno text DEFAULT ''::text NOT NULL,
    operador text DEFAULT ''::text NOT NULL,
    ayudante text DEFAULT ''::text NOT NULL,
    maquina text DEFAULT ''::text NOT NULL,
    cod_botella text DEFAULT ''::text NOT NULL,
    bot_buenas integer DEFAULT 0 NOT NULL,
    merma_bot integer DEFAULT 0 NOT NULL,
    merma_pref integer DEFAULT 0 NOT NULL,
    num_bolsas integer DEFAULT 0 NOT NULL,
    hora_inicio text DEFAULT ''::text NOT NULL,
    hora_fin text DEFAULT ''::text NOT NULL,
    minutos_disponibles integer DEFAULT 0 NOT NULL,
    paradas_programadas text DEFAULT '[]'::text NOT NULL,
    paradas_no_programadas text DEFAULT '[]'::text NOT NULL,
    tiempo_cambio_molde integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    etiq_ini integer DEFAULT 0 NOT NULL,
    etiq_fin integer DEFAULT 0 NOT NULL,
    cant_por_bolsa integer DEFAULT 0 NOT NULL,
    merma_total integer DEFAULT 0 NOT NULL,
    total_produccion integer DEFAULT 0 NOT NULL,
    defectos_preforma text DEFAULT '[]'::text NOT NULL,
    fin_produccion_saldo integer DEFAULT 0 NOT NULL,
    fin_produccion_pedido_especial integer DEFAULT 0 NOT NULL,
    saldo_generado integer DEFAULT 0 NOT NULL,
    cantidad_extra_pedido_especial integer DEFAULT 0 NOT NULL,
    cm_ini text DEFAULT ''::text NOT NULL,
    cm_fin text DEFAULT ''::text NOT NULL,
    estado_validacion text DEFAULT 'pendiente'::text NOT NULL,
    validado_por text DEFAULT ''::text NOT NULL,
    validado_en text DEFAULT ''::text NOT NULL,
    rechazado_por text DEFAULT ''::text NOT NULL,
    rechazado_en text DEFAULT ''::text NOT NULL,
    motivo_rechazo text DEFAULT ''::text NOT NULL,
    observaciones text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.reportes_diarios OWNER TO etiquetas2_app;

--
-- Name: reportes_diarios_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.reportes_diarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reportes_diarios_id_seq OWNER TO etiquetas2_app;

--
-- Name: reportes_diarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.reportes_diarios_id_seq OWNED BY public.reportes_diarios.id;


--
-- Name: saldo_botellas; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.saldo_botellas (
    id integer NOT NULL,
    cod_botella text NOT NULL,
    maquina text DEFAULT ''::text NOT NULL,
    cantidad_actual integer DEFAULT 0 NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL,
    fecha text NOT NULL,
    observaciones text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    updated_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.saldo_botellas OWNER TO etiquetas2_app;

--
-- Name: saldo_botellas_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.saldo_botellas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.saldo_botellas_id_seq OWNER TO etiquetas2_app;

--
-- Name: saldo_botellas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.saldo_botellas_id_seq OWNED BY public.saldo_botellas.id;


--
-- Name: saldo_botellas_mov; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.saldo_botellas_mov (
    id integer NOT NULL,
    saldo_id integer NOT NULL,
    reporte_id integer NOT NULL,
    tipo text NOT NULL,
    cantidad integer NOT NULL,
    fecha text,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL
);


ALTER TABLE public.saldo_botellas_mov OWNER TO etiquetas2_app;

--
-- Name: saldo_botellas_mov_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.saldo_botellas_mov_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.saldo_botellas_mov_id_seq OWNER TO etiquetas2_app;

--
-- Name: saldo_botellas_mov_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.saldo_botellas_mov_id_seq OWNED BY public.saldo_botellas_mov.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.sessions (
    token text NOT NULL,
    user_id integer NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    expires_at text NOT NULL
);


ALTER TABLE public.sessions OWNER TO etiquetas2_app;

--
-- Name: users; Type: TABLE; Schema: public; Owner: etiquetas2_app
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    password_hash text NOT NULL,
    password_salt text NOT NULL,
    role text DEFAULT 'lectura'::text NOT NULL,
    created_at text DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'::text) NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'calidad'::text, 'lectura'::text])))
);


ALTER TABLE public.users OWNER TO etiquetas2_app;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: etiquetas2_app
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO etiquetas2_app;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: etiquetas2_app
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: cajas_preforma id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.cajas_preforma ALTER COLUMN id SET DEFAULT nextval('public.cajas_preforma_id_seq'::regclass);


--
-- Name: cajas_preforma_mov id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.cajas_preforma_mov ALTER COLUMN id SET DEFAULT nextval('public.cajas_preforma_mov_id_seq'::regclass);


--
-- Name: etiquetas_entries id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.etiquetas_entries ALTER COLUMN id SET DEFAULT nextval('public.etiquetas_entries_id_seq'::regclass);


--
-- Name: machines id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.machines ALTER COLUMN id SET DEFAULT nextval('public.machines_id_seq'::regclass);


--
-- Name: personal id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.personal ALTER COLUMN id SET DEFAULT nextval('public.personal_id_seq'::regclass);


--
-- Name: planes id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planes ALTER COLUMN id SET DEFAULT nextval('public.planes_id_seq'::regclass);


--
-- Name: planificacion_adiciones id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_adiciones ALTER COLUMN id SET DEFAULT nextval('public.planificacion_adiciones_id_seq'::regclass);


--
-- Name: planificacion_historial id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_historial ALTER COLUMN id SET DEFAULT nextval('public.planificacion_historial_id_seq'::regclass);


--
-- Name: planificacion_paros id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_paros ALTER COLUMN id SET DEFAULT nextval('public.planificacion_paros_id_seq'::regclass);


--
-- Name: planificacion_reasignaciones id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_reasignaciones ALTER COLUMN id SET DEFAULT nextval('public.planificacion_reasignaciones_id_seq'::regclass);


--
-- Name: reportes_diarios id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.reportes_diarios ALTER COLUMN id SET DEFAULT nextval('public.reportes_diarios_id_seq'::regclass);


--
-- Name: saldo_botellas id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.saldo_botellas ALTER COLUMN id SET DEFAULT nextval('public.saldo_botellas_id_seq'::regclass);


--
-- Name: saldo_botellas_mov id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.saldo_botellas_mov ALTER COLUMN id SET DEFAULT nextval('public.saldo_botellas_mov_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: botellas; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.botellas (id, maquina, cod_bot, cod_pref, gramaje, volumen, cliente, descripcion, color, u_bolsa, u_pallet, velocidad, rosca, moldes) FROM stdin;
2	SEM 63	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
3	SEM 63	30149	5646	56	3000	LAUVAL	BOT-CR-3.0 LT 56 GR-LAUVAL	CRISTAL	80	\N	3600	1816 LF	\N
4	SEM 63	7200	5646	56	3000	VARIOS	BOT-CR-3.0 LT-56 GR-GENERICO	CRISTAL	80	\N	3600	1816 LF	\N
5	SEM 63	7200-3	5646-3	56	3000	VARIOS	BOT-CR-3.0 LT-56 GR-GENERICO	CRISTAL	80.0	\N	3600	1816 LF	\N
6	SEM 63	7208	5650-3	56	3000	VARIOS	BOT-VE-3.0 LT 56 GR-ONDA	VERDE	80.0	\N	3600	1816 LF	\N
7	SEM 63	19739	5652	48	2000	VARIOS	BOT-CR-2 LTS-48 GR GENERICA	CRISTAL	114	\N	4000	1816 LF	\N
8	SEM 63	19739-3	5652-3	48	2000	VARIOS	BOT-CR-2 LTS - 48 GR 30% GENERICA	CRISTAL	114.0	\N	4000	1816 LF	\N
9	SEM 63	26407-100	5652	48	2000	VARIOS	BOT-CR-2 LITROS SPORT GENERICA	CRISTAL	120	\N	4000	1816 LF	\N
10	SEM 63	34118	5652	48	1800	DELYSOY	BOT-CR-1800 CC- 48 GR - DELY SOY	CRISTAL	126	\N	4000	1816 LF	\N
11	SEM 63	30152	11982	17.5	300	VARIOS	BOT-CR-300 CC-17.5 GR	CRISTAL	\N	\N	4000	1816 LF	\N
12	SEM 63	15649	5621-3	22	600	BEBIDAS	BOT-VE-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	VERDE	295.0	\N	4000	1816 LF	\N
13	SEM 63	26406	5659-3	48	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	VERDE	120.0	\N	4000	1816 LF	\N
14	SEM 63	26407-3	5652-3	48	2000	VARIOS	BOT-CR-2 LITROS SPORT GENERICA NUEVO MOLDE	CRISTAL	120.0	\N	4000	1816 LF	\N
15	SEM 63	14590-100	5615-100	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295	\N	4000	1816 LF	\N
16	SEM 63	34118-3	5652-3	48	1800	DELYSOY	BOT-CR-1800 CC- 48 GR - DELY SOY	CRISTAL	126.0	\N	4000	1816 LF	\N
17	SEM 63	7200-100	5646-100	56	3000	VARIOS	BOT-CR-3.0 LT-56 GR-GENERICO	CRISTAL	80	\N	3600	1816 LF	\N
18	SEM 63	30150	5625-3	24.5	700	VARIOS	BOT-CR-700 CC-24.5 GR	CRISTAL	279.0	\N	4000	1816 LF	\N
19	SEM 63	30149-100	5646-100	56	3000	LAUVAL	BOT-CR-3.0 LT 56 GR-LAUVAL	CRISTAL	80	\N	3600	1816 LF	\N
20	SEM 63	26407-100	5652-100	48	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	CRISTAL	120	\N	4000	1816 LF	\N
21	SEM 63	19739-100	5652-100	48	2000	VARIOS	BOT-CR-2 LTS-48 GR GENERICA	CRISTAL	114	\N	4000	1816 LF	\N
22	SEM 139	14591	5615-3	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330.0	\N	650	1816 LF	\N
23	SEM 139	35144	5638	52	1800	RICKSOY	BOT-CR-1.8 LT - 52 GR NUEVO RICK SOY	CRISTAL	\N	\N	\N	1816 LF	\N
24	SEM 139	7563	5638	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104	\N	550	1816 LF	\N
25	SEM 139	35847	14885	54.6	3000	DELIS	BOT-CR-3 LTS- 54,6 GR - DELIS	CRISTAL	85	\N	\N	1881 SF	\N
26	SEM 139	35797	14877	46.66	2000	DELIS	BOT-CR-2.0 LT-46,66 GR - DELIS	CRISTAL	120	\N	600	1881 SF	\N
27	SEM 139	33453	6448	37	900	RICKSOY	BOT-CR-900 CC- 37 GR - RICK SOY	CRISTAL	210	\N	\N	1816 LF	\N
28	SEM 139	36318	7538	37	500	SILOE	BOT - BL- 500 CC - 37 GR BLANCO - SILOE	BLANCO	352	\N	520	1816 LF	\N
29	SEM 139	36309	28618	17.5	300	LEONEL	BOT-CR-300 CC LEONEL	CRISTAL	297	\N	620	1816 LF	\N
30	SEM 139	34792	14877-3	46.6	1100	ACTIVA	BOT-CR-1.1 LT- 46.66 GR SF - ACTIVA	CRISTAL	231	\N	520	1881 SF	\N
31	SEM 139	35307	14877-3	46.6	900	ACTIVA	BOT-CR-0.9 LT- 46.66 GR SF - ACTIVA	CRISTAL	240	\N	\N	1881 SF	\N
32	SEM 139	10346	14875-3	20.6	500	LEONEL	BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL	CRISTAL	340	\N	\N	1881 SF	\N
33	SEM 139	31756	5847	48	900	UNILEVER	BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO	BLANCO	234	\N	650	1816 LF	\N
34	SEM 139	32253	23289-3	52.65	1800	UNILEVER	BOT-CR-1.8 LT-SAP: 68431805- AROMATIC 52.7 GR SHORT FI	CRISTAL	130	\N	580	1881 SF	\N
35	SEM 139	34256	5646-3	56	2000	UNILEVER	BOT-CR-2000 CC-SAP: 68414051- VAJILLERO OLA 56 GR	CRISTAL	117.0	\N	\N	1816 LF	\N
36	SEM 139	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	234	\N	620	1816 LF	\N
37	SEM 139	34918	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 69618454- MAXIMUS 46.66 GR SHORT	CRISTAL	247	\N	\N	1881 SF	\N
38	SEM 139	35809	5652-3	48	1000	UNILEVER	BOT-CR-1 LT-SAP:68493102 -JABON LIZ 48 GR	CRISTAL	143.0	\N	520	1816 LF	\N
39	SEM 139	36107	35858	45	1000	KLBUSINESS	BOT-CR-1 LT -ZUMOBOL	CRISTAL	210	\N	\N	38mm SF	\N
40	SEM 139	36106	35857	27	500	KLBUSINESS	BOT-CR-500 CC-ZUMOBOL	CRISTAL	342	\N	\N	38mm SF	\N
41	SEM 139	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
42	SEM 139	24438	6448	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208.0	\N	600	1816 LF	\N
43	SEM 139	37150	5646-3	56	3000	FREDDY COLQUE	BOT-CR-3 LTS- 56 GR - FREDDY COLQUE	CRISTAL	85.0	\N	\N	1816 LF	\N
44	SEM 139	37426	5621-3	22	500	LEONEL	BOT-VE-500 CC-LEONEL	VERDE	340.0	\N	460	1816 LF	\N
45	SEM 139	31594	5652	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120.0	\N	620	1816 LF	\N
46	SEM 139	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	580	1816 LF	\N
47	SEM 139	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	580	1816 LF	\N
48	SEM 139	37519	12481-3	17.5	300	LEONEL	BOT-VE-300 CC-LEONEL	VERDE	280	\N	500	1816 LF	\N
49	SEM 139	27113	11982	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1816 LF	\N
50	SEM 139	37568	34859-3	31.5	1000	LEONEL	BOT-CR-1 LT- 31,5 GR- LEONEL	CRISTAL	208	\N	620	1881 SF	\N
51	SEM 139	37786	\N	37	1000	LEONEL	BOT-VE-1 LT- 37 GR- LEONEL	VERDE	208	\N	480	1816 LF	\N
52	SEM 139	37814	5652-3	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0	\N	620	1816 LF	\N
53	SEM 139	37829	5615	22	500	LEONEL	BOT-CR-500 CC- LEONEL	CRISTAL	340	\N	500	1816 LF	\N
54	SEM 139	37964	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ENALSIM	VERDE	120.0	\N	650	1816 LF	\N
55	SEM 139	38221	28618-3	17.5	250	TONEL	BOT-CR-250 CC- TONEL	CRISTAL	341	\N	\N	1816 LF	\N
56	SEM 139	38225	14875-3	20.6	500	TONEL	BOT-CR-500 CC- TONEL	CRISTAL	340	\N	\N	1881 SF	\N
57	SEM 139	38226	14876-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213.0	\N	520	1881 SF	\N
58	SEM 139	38251	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
59	SEM 139	38279	34859-3	31.5	1500	TONEL	BOT-CR-1500 CC- TONEL	CRISTAL	169	\N	\N	1881 SF	\N
60	SEM 139	38339	34859-3	31.5	600	ACTIVA	BOT-CR-600 CC- ACTIVA	CRISTAL	364	\N	620	1881 SF	\N
61	SEM 139	38344	28618-3	17.5	230	TONEL	BOT-CR-230 CC- TONEL	CRISTAL	364	\N	\N	1816 LF	\N
62	SEM 139	38442	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC POPULAR- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
63	SEM 139	7272	6448-3	37	1000	VARIOS	BOT-CR-1 LT- 37 GR- GARRAFITA	CRISTAL	182.0	\N	\N	1816 LF	\N
64	SEM 139	38459	5646	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85	\N	500	1816 LF	\N
65	SEM 139	38460	6448	37	1800	VARIOS	BOT-CR-1800 CC- 37 GR - GENERICO VARIOS	CRISTAL	126	\N	\N	1816 LF	\N
66	SEM 139	38481	8235-3	60	2000	UNILEVER	BOT-CR-2000 CC- VAJILLERO OLA 60 GR	CRISTAL	120.0	\N	420	1816 LF	\N
67	SEM 139	38624	28618-3	17.5	300	TONEL	BOT-CR-300 CC- TONEL	CRISTAL	336	\N	\N	1816 LF	\N
68	SEM 139	38827	21006	52	500	PILAR	BOT-BL-500 CC- PILAR	BLANCO	240	\N	650	1816 LF	\N
69	SEM 139	32895	6448	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208.0	\N	620	1816 LF	\N
71	SEM 139	32805	11982	17.5	250	CRUZ	BOT-CR-250 CC- MISTER	CRISTAL	345.0	\N	650	1816 LF	\N
72	SEM 139	39132	28618-3	17.5	110	TONEL	BOT-CR-110 CC- TONEL	CRISTAL	1000	\N	\N	1816 LF	\N
73	SEM 139	39326	5631	28	900	VARIOS	BOT-CR-900 CC- 28 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
74	SEM 139	39582	6448-100	37	1500	BEBIDAS	BOT-CR-1500 CC- BEBIDAS	CRISTAL	161	\N	540	1816 LF	\N
75	SEM 139	39790	5646	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	500	1816 LF	\N
76	SEM 139	39978	14876-3	23.1	700	DEPROAL	BOT-CR-700 CC- DEPROAL	CRISTAL	270	\N	600	1881 SF	\N
77	SEM 139	40140	6448	37	1500	DELYSOY	BOT-CR-1500 CC- DELYSOY	CRISTAL	150.0	\N	550	1816 LF	\N
78	SEM 139	40159	7060	28	350	HAMPY SANA	BOT-BL-350 CC- HAMPY SANA	BLANCO	500	\N	700	1816 LF	\N
79	SEM 139	40160	5652	48	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	550	1816 LF	\N
80	SEM 139	40491	5631	28	900	DELYSOY	BOT-CR-900 CC- DELYSOY	CRISTAL	247	\N	550	1816 LF	\N
81	SEM 139	40661	5646	56	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	85	\N	600	1816 LF	\N
82	SEM 139	40954	5646	56	2000	AGUA LUNA	BOT-CR-2000 CC- AGUA LUNA	CRISTAL	120	\N	400	1816 LF	\N
83	SEM 139	40998	14885	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
84	SEM 139	41021	14877	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
85	SEM 139	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
86	SEM 139	42323	34859-3	31.5	1000	DELIS	BOT-CR-1 LT- 31,5 GR- DELIS	CRISTAL	224	\N	500	1881 SF	\N
87	SEM 139	42325	28618-3	17.5	330	DELIS	BOT-CR-330 CC- DELIS	CRISTAL	330	\N	600	1816 LF	\N
88	SEM 139	42324	14876	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
89	SEM 139	27113-3	11982-3	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1881 LF	\N
90	SEM 139	42473	26041-3	42.5	900	ACTIVA	BOT-CR-0.9 LT- 42.5 GR SF - ACTIVA	CRISTAL	240	\N	520	1881 SF	\N
91	SEM 139	42474	34859-3	31.5	200	VARIOS	BOT-CR-200 CC- LICOR RODAS	CRISTAL	500	\N	620	1881 SF	\N
92	SEM 139	7563-3	5638-3	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104.0	\N	600	1881 LF	\N
93	SEM 139	42324-3	14876-3	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	550	1881 SF	\N
94	SEM 139	13736-3	6448-3	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161.0	\N	600	1881 LF	\N
95	SEM 139	42724	14885	54.6	3000	VIMOZ	BOT-CR-3000 CC- VIMOZ	CRISTAL	85	\N	520	1881 SF	\N
96	SEM 139	42950	5615-3	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330.0	\N	550	1816 LF	\N
97	SEM 139	43388	5619-3	22	500	PILAR	BOT-CR-500 CC- PILAR	AZUL	347.0	\N	580	1816 LF	\N
98	SEM 139	40998-3	14885-3	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	530	1881 SF	\N
99	SEM 139	39790-3	5646-3	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85.0	\N	500	1816 LF	\N
100	SEM 139	38459-3	5646-3	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85.0	\N	500	1816 LF	\N
101	SEM 139	44377	14875-3	20.6	250	ACTIVA	BOT-CR-250 CC- ACTIVA	CRISTAL	392	\N	650	1816 LF	\N
102	SEM 139	32573-100	5615-100	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330	\N	600	1816 LF	\N
103	SEM 139	32692-100	5615-100	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340	\N	620	1816 LF	\N
104	SEM 139	14591-100	5615-100	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330	\N	650	1816 LF	\N
105	SEM 139	41021-3	14877-3	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	530	1881 SF	\N
106	SEM 139	44688	14885-3	54.6	3000	EPSIS	BOT-CR-3000 CC- EPSIS	CRISTAL	80	\N	520	1881 SF	\N
107	SEM 139	13736-100	6448-100	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
108	SEM 139	44772	6448-100	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216	\N	640	1816 LF	\N
109	SEM 139	44773	23289-3	52.65	3000	EPSIS	BOT-CR-3 LT-EPSIS	CRISTAL	85	\N	530	1881 SF	\N
110	SEM 139	24438-100	6448-100	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	600	1816 LF	\N
111	SEM 139	31594-100	5652-100	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	620	1816 LF	\N
112	SEM 139	44898	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295	\N	640	1881 SF	\N
113	SEM 139	32895-100	6448-100	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208	\N	620	1816 LF	\N
114	SEM 139	39790-100	5646-100	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	530	1816 LF	\N
115	SEM 139	37814-100	5652-100	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126	\N	620	1816 LF	\N
116	SEM 139	42324-100	14876-100	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
117	SEM 139	40597	34859-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213	\N	440	1881 SF	\N
118	SEM 139	45065	5646-100	56	3000	BIOFITNE	BOT-CR-3 LTS- 56 GR - BIOFITNE	CRISTAL	85	\N	250	1816 LF	\N
119	SEM 139	45421	6448-100	37	1050	VARIOS	BOT-CR-1.050 CC-37 GR-VAJILLERO GEN	CRISTAL	204	\N	630	1816 LF	\N
120	SEM 139	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
121	SEM 139	45854	14877-3	46.66	1050	WARA	BOT-CR-1050 CC-46.6 GR - WARA	CRISTAL	240	\N	510	1881 SF	\N
179	SEM 48	31594	5652	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120.0	\N	620	1816 LF	\N
122	SEM 139	45791	\N	22	500	INTERNATIONALGO	BOT-CR-500 CC-22 GR -3 INTERNATIONALGO	CRISTAL	330	\N	620	1816 LF	\N
123	SEM 139	45853	34859-3	31.5	500	WARA	BOT-CR-500 CC-31,5 GR - WARA	CRISTAL	336	\N	630	1881 SF	\N
124	SEM 139	45870	34859-3	31.5	200	FLORENTINO	BOT-CR-200 CC-31.5 GR-LICOR FLORENTINO	CRISTAL	500	\N	650	1881 SF	\N
125	SEM 139	45719	14876-100	23.16	500	VARIOS	BOT. CR-500 CC-23.16 GR SF-VAJILLERO GEN	CRISTAL	288	\N	650	1881 SF	\N
126	SEM 139	42950-100	5615-100	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330	\N	650	1816 LF	\N
127	SEM 139	46213	5652-100	48	1050	WARA	BOT-CR-1050 CC-48 GR - WARA	CRISTAL	240	\N	510	1881 SF	\N
128	SEM 139	46493	14875-3	20.6	200	VARIOS	BOT-CR-200 CC-20.6 GR-LICOR GENERICO	CRISTAL	500	\N	680	1881 SF	\N
129	SEM 139	46828-100	34859-100	31.5	200	VARIOS	BOT-CR-200 CC-31,5 GR - LICOR GENERICO	CRISTAL	500.0	\N	630	1816 LF	\N
130	SEM 139	48400-100	6448-100	37	900	VARIOS	BOT-CR-900 CC- 37 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
131	SEM 66	13734	5615	22	600	VARIOS	BOT-CR-600 CC-22 GR-ESTRIADAS	CRISTAL	295	\N	1200	1816 LF	\N
132	SEM 66	14590	\N	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295	\N	1250	1816 LF	\N
133	SEM 66	15649	5621-3	22	600	BEBIDAS	BOT VER 600 CC 22 GR ESTRIADA BEBIDAS S.A	VERDE	295.0	\N	1200	1816 LF	\N
134	SEM 66	7097	5615	22	500	VARIOS	BOT-CR-1/2 LT-22 GR-MISIL	CRISTAL	340	\N	1250	1816 LF	\N
135	SEM 66	13739	5638-3	52	2500	BEBIDAS	BOT-CR-2.500 CC-52 GR-LISA	CRISTAL	105.0	\N	1170	1816 LF	\N
136	SEM 66	13737	5652-3	48	2000	BEBIDAS	BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.	CRISTAL	126.0	\N	1150	1816 LF	\N
137	SEM 66	15603	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ESTRIADA	VERDE	126.0	\N	1100	1816 LF	\N
138	SEM 66	26407	5652	48	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	CRISTAL	120	\N	1100	1816 LF	\N
139	SEM 66	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	1120	1816 LF	\N
140	SEM 66	16033	6448	37	1000	VARIOS	BOT-CR-1.0 LT-37 GR-PIL FRUTSS	CRISTAL	216.0	\N	1200	1816 LF	\N
141	SEM 66	24438	6448	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	1150	1816 LF	\N
142	SEM 66	30154	6448-3	37	1000	VARIOS	BOT-CR-1 LT-37 GR-SEASA	CRISTAL	216.0	\N	1200	1816 LF	\N
143	SEM 66	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	1150	1816 LF	\N
144	SEM 66	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	1120	1816 LF	\N
145	SEM 66	31757	11982-3	17.5	200	UNILEVER	BOT-CR-0.200 LT-SAP: 68414059- VAJILLERO OLA 17.5 GR	CRISTAL	432	\N	1100	1816 LF	\N
146	SEM 66	32025	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 68421694- AROMATIC 46.66 GR SHORT	CRISTAL	234	\N	1200	1881 SF	\N
147	SEM 66	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	234	\N	1150	1816 LF	\N
148	SEM 66	7097-3	5615-3	22	500	VARIOS	BOT-CR-1/2 LT-22 GR-MISIL	CRISTAL	340.0	\N	1200	1816 LF	\N
149	SEM 66	13734-3	5615-3	22	600	VARIOS	BOT-CR-600 CC-22 GR-ESTRIADAS	CRISTAL	295.0	\N	1200	1816 LF	\N
150	SEM 66	14590-100	5615-100	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295	\N	1350	1816 LF	\N
151	SEM 66	30154-100	6448-100	37	1000	VARIOS	BOT-CR-1 LT-37 GR-SEASA	CRISTAL	216	\N	1200	1816 LF	\N
152	SEM 66	13734-100	5615-100	22	600	VARIOS	BOT-CR-600 CC-22 GR-ESTRIADAS	CRISTAL	295	\N	1200	1816 LF	\N
153	SEM 66	13737-100	5652-100	48	2000	VARIOS	BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.	CRISTAL	126	\N	1150	1816 LF	\N
154	SEM 66	44897	6448-100	37	1000	VARIOS	BOT-CR-1.0 LT-37 GR-PIL FRUTSS	CRISTAL	216	\N	1200	1816 LF	\N
155	SEM 66	7097-100	5615-100	22	500	VARIOS	BOT-CR-1/2 LT-22 GR-MISIL	CRISTAL	350	\N	1200	1816 LF	\N
156	SEM 48	14591	5615-3	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330.0	\N	650	1816 LF	\N
157	SEM 48	35144	5638	52	1800	RICKSOY	BOT-CR-1.8 LT - 52 GR NUEVO RICK SOY	CRISTAL	\N	\N	\N	1816 LF	\N
158	SEM 48	7563	5638	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104	\N	550	1816 LF	\N
159	SEM 48	35847	14885	54.6	3000	DELIS	BOT-CR-3 LTS- 54,6 GR - DELIS	CRISTAL	85	\N	\N	1881 SF	\N
160	SEM 48	35797	14877	46.66	2000	DELIS	BOT-CR-2.0 LT-46,66 GR - DELIS	CRISTAL	120	\N	\N	1881 SF	\N
161	SEM 48	33453	6448	37	900	RICKSOY	BOT-CR-900 CC- 37 GR - RICK SOY	CRISTAL	210	\N	\N	1816 LF	\N
162	SEM 48	36318	7538	37	500	SILOE	BOT - BL- 500 CC - 37 GR BLANCO - SILOE	BLANCO	352	\N	580	1816 LF	\N
163	SEM 48	36309	28618	17.5	300	LEONEL	BOT-CR-300 CC LEONEL	CRISTAL	297	\N	620	1816 LF	\N
164	SEM 48	34792	14877-3	46.6	1100	ACTIVA	BOT-CR-1.1 LT- 46.66 GR SF - ACTIVA	CRISTAL	231	\N	650	1881 SF	\N
165	SEM 48	35307	14877-3	46.6	900	ACTIVA	BOT-CR-0.9 LT- 46.66 GR SF - ACTIVA	CRISTAL	240	\N	\N	1881 SF	\N
166	SEM 48	10346	14875-3	20.6	500	LEONEL	BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL	CRISTAL	340	\N	\N	1881 SF	\N
167	SEM 48	31756	5847	48	900	UNILEVER	BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO	BLANCO	216	\N	660	1816 LF	\N
168	SEM 48	32253	23289-3	52.65	1800	UNILEVER	BOT-CR-1.8 LT-SAP: 68431805- AROMATIC 52.7 GR SHORT FI	CRISTAL	130	\N	580	1881 SF	\N
169	SEM 48	34256	5646-3	56	2000	UNILEVER	BOT-CR-2000 CC-SAP: 68414051- VAJILLERO OLA 56 GR	CRISTAL	117.0	\N	\N	1816 LF	\N
170	SEM 48	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	216	\N	650	1816 LF	\N
171	SEM 48	34918	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 69618454- MAXIMUS 46.66 GR SHORT	CRISTAL	247	\N	\N	1881 SF	\N
172	SEM 48	35809	5652-3	48	1000	UNILEVER	BOT-CR-1 LT-SAP:68493102 -JABON LIZ 48 GR	CRISTAL	143.0	\N	520	1816 LF	\N
173	SEM 48	36107	35858	45	1000	KLBUSINESS	BOT-CR-1 LT -ZUMOBOL	CRISTAL	210	\N	\N	38mm SF	\N
174	SEM 48	36106	35857	27	500	KLBUSINESS	BOT-CR-500 CC-ZUMOBOL	CRISTAL	342	\N	\N	38mm SF	\N
175	SEM 48	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
176	SEM 48	24438	6448	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208.0	\N	600	1816 LF	\N
177	SEM 48	37150	5646-3	56	3000	FREDDY COLQUE	BOT-CR-3 LTS- 56 GR - FREDDY COLQUE	CRISTAL	85.0	\N	\N	1816 LF	\N
178	SEM 48	37426	5621-3	22	500	LEONEL	BOT-VE-500 CC-LEONEL	VERDE	340.0	\N	460	1816 LF	\N
180	SEM 48	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	580	1816 LF	\N
181	SEM 48	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	580	1816 LF	\N
182	SEM 48	37519	12481-3	17.5	300	LEONEL	BOT-VE-300 CC-LEONEL	VERDE	280	\N	500	1816 LF	\N
183	SEM 48	27113	11982	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1816 LF	\N
184	SEM 48	37568	34859-3	31.5	1000	LEONEL	BOT-CR-1 LT- 31,5 GR- LEONEL	CRISTAL	208	\N	640	1881 SF	\N
185	SEM 48	37786	\N	37	1000	LEONEL	BOT-VE-1 LT- 37 GR- LEONEL	VERDE	208	\N	480	1816 LF	\N
186	SEM 48	37814	5652-3	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0	\N	620	1816 LF	\N
187	SEM 48	37829	5615	22	500	LEONEL	BOT-CR-500 CC- LEONEL	CRISTAL	340	\N	500	1816 LF	\N
188	SEM 48	37964	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ENALSIM	VERDE	120.0	\N	650	1816 LF	\N
189	SEM 48	38221	28618-3	17.5	250	TONEL	BOT-CR-250 CC- TONEL	CRISTAL	341	\N	\N	1816 LF	\N
190	SEM 48	38225	14875-3	20.6	500	TONEL	BOT-CR-500 CC- TONEL	CRISTAL	340	\N	\N	1881 SF	\N
191	SEM 48	38226	14876-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213.0	\N	520	1881 SF	\N
192	SEM 48	38251	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
193	SEM 48	38279	34859-3	31.5	1500	TONEL	BOT-CR-1500 CC- TONEL	CRISTAL	169	\N	\N	1881 SF	\N
194	SEM 48	38339	34859-3	31.5	600	ACTIVA	BOT-CR-600 CC- ACTIVA	CRISTAL	364	\N	650	1881 SF	\N
195	SEM 48	38344	28618-3	17.5	230	TONEL	BOT-CR-230 CC- TONEL	CRISTAL	364	\N	\N	1816 LF	\N
196	SEM 48	38442	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC POPULAR- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
197	SEM 48	7272	6448-3	37	1000	VARIOS	BOT-CR-1 LT- 37 GR- GARRAFITA	CRISTAL	182.0	\N	\N	1816 LF	\N
198	SEM 48	38459	5646	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85	\N	500	1816 LF	\N
199	SEM 48	38460	6448	37	1800	VARIOS	BOT-CR-1800 CC- 37 GR - GENERICO VARIOS	CRISTAL	126	\N	\N	1816 LF	\N
200	SEM 48	38481	8235-3	60	2000	UNILEVER	BOT-CR-2000 CC- VAJILLERO OLA 60 GR	CRISTAL	120.0	\N	420	1816 LF	\N
201	SEM 48	38624	28618-3	17.5	300	TONEL	BOT-CR-300 CC- TONEL	CRISTAL	336	\N	\N	1816 LF	\N
202	SEM 48	38827	21006	52	500	PILAR	BOT-BL-500 CC- PILAR	BLANCO	240	\N	650	1816 LF	\N
203	SEM 48	32895	6448	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208.0	\N	620	1816 LF	\N
205	SEM 48	32805	11982	17.5	250	CRUZ	BOT-CR-250 CC- MISTER	CRISTAL	345.0	\N	650	1816 LF	\N
206	SEM 48	39132	28618-3	17.5	110	TONEL	BOT-CR-110 CC- TONEL	CRISTAL	1000	\N	\N	1816 LF	\N
207	SEM 48	39326	5631	28	900	VARIOS	BOT-CR-900 CC- 28 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
208	SEM 48	39582	6448-100	37	1500	BEBIDAS	BOT-CR-1500 CC- BEBIDAS	CRISTAL	161	\N	540	1816 LF	\N
209	SEM 48	39790	5646	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	500	1816 LF	\N
210	SEM 48	39978	14876-3	23.1	700	DEPROAL	BOT-CR-700 CC- DEPROAL	CRISTAL	270	\N	600	1881 SF	\N
211	SEM 48	40140	6448	37	1500	DELYSOY	BOT-CR-1500 CC- DELYSOY	CRISTAL	150.0	\N	550	1816 LF	\N
212	SEM 48	40159	7060	28	350	HAMPY SANA	BOT-BL-350 CC- HAMPY SANA	BLANCO	500	\N	700	1816 LF	\N
213	SEM 48	40160	5652	48	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	\N	1816 LF	\N
214	SEM 48	40491	5631	28	900	DELYSOY	BOT-CR-900 CC- DELYSOY	CRISTAL	247	\N	600	1816 LF	\N
215	SEM 48	40661	5646	56	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	85	\N	\N	1816 LF	\N
216	SEM 48	40954	5646	56	2000	AGUA LUNA	BOT-CR-2000 CC- AGUA LUNA	CRISTAL	120	\N	400	1816 LF	\N
217	SEM 48	40998	14885	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
218	SEM 48	41021	14877	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
219	SEM 48	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
220	SEM 48	42323	34859-3	31.5	1000	DELIS	BOT-CR-1 LT- 31,5 GR- DELIS	CRISTAL	224	\N	600	1881 SF	\N
221	SEM 48	42325	28618-3	17.5	330	DELIS	BOT-CR-330 CC- DELIS	CRISTAL	330	\N	620	1816 LF	\N
222	SEM 48	42324	14876	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
223	SEM 48	27113-3	11982-3	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	640	1881 LF	\N
224	SEM 48	42473	26041-3	42.5	900	ACTIVA	BOT-CR-0.9 LT- 42.5 GR SF - ACTIVA	CRISTAL	240	\N	650	1881 SF	\N
225	SEM 48	42474	34859-3	31.5	200	VARIOS	BOT-CR-200 CC- LICOR RODAS	CRISTAL	500	\N	620	1881 SF	\N
226	SEM 48	7563-3	5638-3	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104.0	\N	600	1881 LF	\N
227	SEM 48	42324-3	14876-3	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	550	1881 SF	\N
228	SEM 48	13736-3	6448-3	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161.0	\N	600	1881 LF	\N
229	SEM 48	42724	14885	54.6	3000	VIMOZ	BOT-CR-3000 CC- VIMOZ	CRISTAL	85	\N	440	1881 SF	\N
230	SEM 48	42950	5615-3	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330.0	\N	550	1816 LF	\N
231	SEM 48	43388	5619-3	22	500	PILAR	BOT-CR-500 CC- PILAR	AZUL	347.0	\N	580	1816 LF	\N
232	SEM 48	40998-3	14885-3	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
233	SEM 48	39790-3	5646-3	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85.0	\N	500	1816 LF	\N
234	SEM 48	38459-3	5646-3	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85.0	\N	500	1816 LF	\N
235	SEM 48	44377	14875-3	20.6	250	ACTIVA	BOT-CR-250 CC- ACTIVA	CRISTAL	392	\N	650	1816 LF	\N
236	SEM 48	32573-100	5615-100	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330	\N	600	1816 LF	\N
237	SEM 48	32692-100	5615-100	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340	\N	650	1816 LF	\N
238	SEM 48	14591-100	5615-100	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330	\N	620	1816 LF	\N
239	SEM 48	41021-3	14877-3	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
240	SEM 48	44688	14885-3	54.6	3000	EPSIS	BOT-CR-3000 CC- EPSIS	CRISTAL	80	\N	500	1881 SF	\N
241	SEM 48	13736-100	6448-100	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
242	SEM 48	44772	6448-100	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216	\N	640	1816 LF	\N
243	SEM 48	44773	23289-3	52.65	3000	EPSIS	BOT-CR-3 LT-EPSIS	CRISTAL	85	\N	530	1881 SF	\N
244	SEM 48	24438-100	6448-100	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	630	1816 LF	\N
245	SEM 48	31594-100	5652-100	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	650	1816 LF	\N
246	SEM 48	44898	14875-3	23.16	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295	\N	640	1881 SF	\N
247	SEM 48	32895-100	6448-100	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208	\N	640	1816 LF	\N
248	SEM 48	39790-100	5646-100	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	530	1816 LF	\N
249	SEM 48	37814-100	5652-100	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126	\N	620	1816 LF	\N
250	SEM 48	42324-100	14876-100	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
251	SEM 48	40597	34859-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213	\N	440	1881 SF	\N
252	SEM 48	45065	5646-100	56	3000	BIOFITNE	BOT-CR-3 LTS- 56 GR - BIOFITNE	CRISTAL	85	\N	250	1816 LF	\N
253	SEM 48	45421	6448-100	37	1050	VARIOS	BOT-CR-1.050 CC-37 GR-VAJILLERO GEN	CRISTAL	204	\N	630	1816 LF	\N
254	SEM 48	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
255	SEM 48	45854	14877-3	46.66	1050	WARA	BOT-CR-1050 CC-46.6 GR - WARA	\N	240	\N	510	1881 SF	\N
256	SEM 48	45791	\N	22	500	INTERNATIONALGO	BOT-CR-500 CC-22 GR -3 INTERNATIONALGO	\N	330	\N	620	1816 LF	\N
257	SEM 48	45853	34859-3	31.5	500	WARA	BOT-CR-500 CC-31,5 GR - WARA	\N	336	\N	630	1881 SF	\N
258	SEM 48	45870	34859-3	31.5	200	FLORENTINO	BOT-CR-200 CC-31.5 GR-LICOR FLORENTINO	\N	500	\N	650	1881 SF	\N
259	SEM 48	45719	14876-100	23.16	500	VARIOS	BOT. CR-500 CC-23.16 GR SF-VAJILLERO GEN	\N	288	\N	650	1881 SF	\N
260	SEM 48	42950-100	5615-100	22	500	VARIOS	BOT-CR-500 CC- CINTURA	\N	330	\N	650	1816 LF	\N
261	SEM 48	46213	5652-100	48	1050	WARA	BOT-CR-1050 CC-48 GR - WARA	\N	240	\N	510	1881 SF	\N
262	SEM 48	24438-3	\N	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	\N	208	\N	630	1816 LF	\N
263	SEM 48	46493	14875-3	20.6	200	VARIOS	BOT-CR-200 CC-20.6 GR-LICOR GENERICO	\N	500	\N	680	1881 SF	\N
264	SEM 48	46764-3	14876-3	23.16	600	MONTANA	BOT-CR-600 CC-23,16 GR-MONTANA	\N	295	\N	650	\N	\N
265	SEM 48	46828-100	34859-100	31.5	200	VARIOS	BOT-CR-200 CC-31,5 GR - LICOR GENERICO	CRISTAL	500.0	\N	630	1816 LF	\N
266	SEM 77	14591	5615-3	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330.0	\N	650	1816 LF	\N
267	SEM 77	35144	5638	52	1800	RICKSOY	BOT-CR-1.8 LT - 52 GR NUEVO RICK SOY	CRISTAL	\N	\N	\N	1816 LF	\N
268	SEM 77	7563	5638	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104	\N	550	1816 LF	\N
269	SEM 77	35847	14885	54.6	3000	DELIS	BOT-CR-3 LTS- 54,6 GR - DELIS	CRISTAL	85	\N	\N	1881 SF	\N
270	SEM 77	35797	14877	46.66	2000	DELIS	BOT-CR-2.0 LT-46,66 GR - DELIS	CRISTAL	120	\N	\N	1881 SF	\N
271	SEM 77	33453	6448	37	900	RICKSOY	BOT-CR-900 CC- 37 GR - RICK SOY	CRISTAL	210	\N	\N	1816 LF	\N
272	SEM 77	36318	7538	37	500	SILOE	BOT - BL- 500 CC - 37 GR BLANCO - SILOE	BLANCO	352	\N	600	1816 LF	\N
273	SEM 77	36309	28618	17.5	300	LEONEL	BOT-CR-300 CC LEONEL	CRISTAL	297	\N	620	1816 LF	\N
274	SEM 77	34792	14877-3	46.6	1100	ACTIVA	BOT-CR-1.1 LT- 46.66 GR SF - ACTIVA	CRISTAL	231	\N	620	1881 SF	\N
275	SEM 77	35307	14877-3	46.6	900	ACTIVA	BOT-CR-0.9 LT- 46.66 GR SF - ACTIVA	CRISTAL	240	\N	\N	1881 SF	\N
276	SEM 77	10346	14875-3	20.6	500	LEONEL	BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL	CRISTAL	340	\N	\N	1881 SF	\N
277	SEM 77	31756	5847	48	900	UNILEVER	BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO	BLANCO	234	\N	650	1816 LF	\N
278	SEM 77	32253	23289-3	52.65	1800	UNILEVER	BOT-CR-1.8 LT-SAP: 68431805- AROMATIC 52.7 GR SHORT FI	CRISTAL	130	\N	650	1881 SF	\N
279	SEM 77	34256	5646-3	56	2000	UNILEVER	BOT-CR-2000 CC-SAP: 68414051- VAJILLERO OLA 56 GR	CRISTAL	117.0	\N	\N	1816 LF	\N
280	SEM 77	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	234	\N	620	1816 LF	\N
281	SEM 77	34918	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 69618454- MAXIMUS 46.66 GR SHORT	CRISTAL	247	\N	\N	1881 SF	\N
282	SEM 77	35809	5652-3	48	1000	UNILEVER	BOT-CR-1 LT-SAP:68493102 -JABON LIZ 48 GR	CRISTAL	143.0	\N	520	1816 LF	\N
283	SEM 77	36107	35858	45	1000	KLBUSINESS	BOT-CR-1 LT -ZUMOBOL	CRISTAL	210	\N	\N	38mm SF	\N
284	SEM 77	36106	35857	27	500	KLBUSINESS	BOT-CR-500 CC-ZUMOBOL	CRISTAL	342	\N	\N	38mm SF	\N
285	SEM 77	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
286	SEM 77	24438	\N	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	620	1816 LF	\N
287	SEM 77	37150	5646-3	56	3000	FREDDY COLQUE	BOT-CR-3 LTS- 56 GR - FREDDY COLQUE	CRISTAL	85.0	\N	\N	1816 LF	\N
288	SEM 77	37426	5621-3	22	500	LEONEL	BOT-VE-500 CC-LEONEL	VERDE	340.0	\N	460	1816 LF	\N
289	SEM 77	31594	5652	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	630	1816 LF	\N
290	SEM 77	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	580	1816 LF	\N
291	SEM 77	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	580	1816 LF	\N
292	SEM 77	37519	12481-3	17.5	300	LEONEL	BOT-VE-300 CC-LEONEL	VERDE	280	\N	500	1816 LF	\N
293	SEM 77	27113	11982	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1816 LF	\N
294	SEM 77	37568	34859-3	31.5	1000	LEONEL	BOT-CR-1 LT- 31,5 GR- LEONEL	CRISTAL	208	\N	640	1881 SF	\N
295	SEM 77	37786	\N	37	1000	LEONEL	BOT-VE-1 LT- 37 GR- LEONEL	VERDE	208	\N	480	1816 LF	\N
296	SEM 77	37814	5652-3	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0	\N	620	1816 LF	\N
297	SEM 77	37829	5615	22	500	LEONEL	BOT-CR-500 CC- LEONEL	CRISTAL	340	\N	500	1816 LF	\N
298	SEM 77	37964	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ENALSIM	VERDE	120.0	\N	650	1816 LF	\N
299	SEM 77	38221	28618-3	17.5	250	TONEL	BOT-CR-250 CC- TONEL	CRISTAL	341	\N	\N	1816 LF	\N
300	SEM 77	38225	14875-3	20.6	500	TONEL	BOT-CR-500 CC- TONEL	CRISTAL	340	\N	\N	1881 SF	\N
301	SEM 77	38226	14876-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213.0	\N	520	1881 SF	\N
302	SEM 77	38251	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
303	SEM 77	38279	34859-3	31.5	1500	TONEL	BOT-CR-1500 CC- TONEL	CRISTAL	169	\N	\N	1881 SF	\N
304	SEM 77	38339	34859-3	31.5	600	ACTIVA	BOT-CR-600 CC- ACTIVA	CRISTAL	364	\N	620	1881 SF	\N
305	SEM 77	38344	28618-3	17.5	230	TONEL	BOT-CR-230 CC- TONEL	CRISTAL	364	\N	\N	1816 LF	\N
306	SEM 77	38442	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC POPULAR- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
307	SEM 77	7272	6448-3	37	1000	VARIOS	BOT-CR-1 LT- 37 GR- GARRAFITA	CRISTAL	182.0	\N	\N	1816 LF	\N
308	SEM 77	38459	5646	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85	\N	500	1816 LF	\N
309	SEM 77	38460	6448	37	1800	VARIOS	BOT-CR-1800 CC- 37 GR - GENERICO VARIOS	CRISTAL	126	\N	\N	1816 LF	\N
310	SEM 77	38481	8235-3	60	2000	UNILEVER	BOT-CR-2000 CC- VAJILLERO OLA 60 GR	CRISTAL	120.0	\N	420	1816 LF	\N
311	SEM 77	38624	28618-3	17.5	300	TONEL	BOT-CR-300 CC- TONEL	CRISTAL	336	\N	\N	1816 LF	\N
312	SEM 77	38827	21006	52	500	PILAR	BOT-BL-500 CC- PILAR	BLANCO	240	\N	650	1816 LF	\N
313	SEM 77	32895	6448	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208.0	\N	620	1816 LF	\N
315	SEM 77	32805	11982	17.5	250	CRUZ	BOT-CR-250 CC- MISTER	CRISTAL	345.0	\N	650	1816 LF	\N
316	SEM 77	39132	28618-3	17.5	110	TONEL	BOT-CR-110 CC- TONEL	CRISTAL	1000	\N	\N	1816 LF	\N
317	SEM 77	39326	5631	28	900	VARIOS	BOT-CR-900 CC- 28 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
318	SEM 77	39582	6448-100	37	1500	BEBIDAS	BOT-CR-1500 CC- BEBIDAS	CRISTAL	161	\N	540	1816 LF	\N
319	SEM 77	39790	5646	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	500	1816 LF	\N
320	SEM 77	39978	14876-3	23.1	700	DEPROAL	BOT-CR-700 CC- DEPROAL	CRISTAL	270	\N	600	1881 SF	\N
321	SEM 77	40140	6448	37	1500	DELYSOY	BOT-CR-1500 CC- DELYSOY	CRISTAL	150.0	\N	550	1816 LF	\N
322	SEM 77	40159	7060	28	350	HAMPY SANA	BOT-BL-350 CC- HAMPY SANA	BLANCO	500	\N	700	1816 LF	\N
323	SEM 77	40160	5652	48	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	\N	1816 LF	\N
324	SEM 77	40491	5631	28	900	DELYSOY	BOT-CR-900 CC- DELYSOY	CRISTAL	247	\N	600	1816 LF	\N
325	SEM 77	40661	5646	56	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	85	\N	\N	1816 LF	\N
326	SEM 77	40954	5646	56	2000	AGUA LUNA	BOT-CR-2000 CC- AGUA LUNA	CRISTAL	120	\N	400	1816 LF	\N
327	SEM 77	40998	14885	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
328	SEM 77	41021	14877	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
329	SEM 77	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
330	SEM 77	42323	34859-3	31.5	1000	DELIS	BOT-CR-1 LT- 31,5 GR- DELIS	CRISTAL	224	\N	500	1881 SF	\N
331	SEM 77	42325	28618-3	17.5	330	DELIS	BOT-CR-330 CC- DELIS	CRISTAL	330	\N	620	1816 LF	\N
332	SEM 77	42324	14876	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
333	SEM 77	27113-3	11982-3	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	650	1881 LF	\N
334	SEM 77	42473	26041-3	42.5	900	ACTIVA	BOT-CR-0.9 LT- 42.5 GR SF - ACTIVA	CRISTAL	240	\N	630	1881 SF	\N
335	SEM 77	42474	34859-3	31.5	200	VARIOS	BOT-CR-200 CC- LICOR RODAS	CRISTAL	500	\N	620	1881 SF	\N
336	SEM 77	7563-3	5638-3	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104.0	\N	650	1881 LF	\N
337	SEM 77	42324-3	14876-3	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	550	1881 SF	\N
338	SEM 77	13736-3	6448-3	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161.0	\N	600	1881 LF	\N
339	SEM 77	42724	14885	54.6	3000	VIMOZ	BOT-CR-3000 CC- VIMOZ	CRISTAL	85	\N	440	1881 SF	\N
340	SEM 77	42950	5615-3	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330.0	\N	550	1816 LF	\N
341	SEM 77	43388	5619-3	22	500	PILAR	BOT-CR-500 CC- PILAR	AZUL	347.0	\N	580	1816 LF	\N
342	SEM 77	40998-3	14885-3	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
343	SEM 77	39790-3	5646-3	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85.0	\N	500	1816 LF	\N
344	SEM 77	38459-3	5646-3	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85.0	\N	500	1816 LF	\N
345	SEM 77	44377	14875-3	20.6	250	ACTIVA	BOT-CR-250 CC- ACTIVA	CRISTAL	392	\N	665	1816 LF	\N
346	SEM 77	32573-100	5615-100	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330	\N	660	1816 LF	\N
347	SEM 77	32692-100	5615-100	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340	\N	650	1816 LF	\N
348	SEM 77	14591-100	5615-100	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330	\N	660	1816 LF	\N
349	SEM 77	41021-3	14877-3	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
350	SEM 77	44688	14885-3	54.6	3000	EPSIS	BOT-CR-3000 CC- EPSIS	CRISTAL	80	\N	500	1881 SF	\N
351	SEM 77	13736-100	6448-100	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
352	SEM 77	44772	6448-100	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216	\N	650	1816 LF	\N
353	SEM 77	44773	23289-3	52.65	3000	EPSIS	BOT-CR-3 LT-EPSIS	CRISTAL	85	\N	530	1881 SF	\N
354	SEM 77	24438-100	6448-100	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	640	1816 LF	\N
355	SEM 77	31594-100	5652-100	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	660	1816 LF	\N
356	SEM 77	44898	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295	\N	650	1881 SF	\N
357	SEM 77	32895-100	6448-100	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208	\N	620	1816 LF	\N
358	SEM 77	39790-100	5646-100	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	530	1816 LF	\N
359	SEM 77	37814-100	5652-100	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126	\N	620	1816 LF	\N
360	SEM 77	42324-100	14876-100	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
361	SEM 77	40597	34859-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213	\N	560	1881 SF	\N
362	SEM 77	45065	5646-100	56	3000	BIOFITNE	BOT-CR-3 LTS- 56 GR - BIOFITNE	CRISTAL	85	\N	310	1816 LF	\N
363	SEM 77	45421	6448-100	37	1050	VARIOS	BOT-CR-1.050 CC-37 GR-VAJILLERO GEN	CRISTAL	204	\N	630	1816 LF	\N
364	SEM 77	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
365	SEM 77	45854	14877-3	46.66	1050	WARA	BOT-CR-1050 CC-46.6 GR - WARA	\N	240	\N	510	1881 SF	\N
366	SEM 77	45791	\N	22	500	INTERNATIONALGO	BOT-CR-500 CC-22 GR -3 INTERNATIONALGO	CRISTAL	330	\N	620	1816 LF	\N
367	SEM 77	45853	34859-3	31.5	500	WARA	BOT-CR-500 CC-31,5 GR - WARA	CRISTAL	336	\N	630	1881 SF	\N
368	SEM 77	45870	34859-3	31.5	200	FLORENTINO	BOT-CR-200 CC-31.5 GR-LICOR FLORENTINO	CRISTAL	500	\N	650	1881 SF	\N
369	SEM 77	45719	14876-100	23.16	500	VARIOS	BOT. CR-500 CC-23.16 GR SF-VAJILLERO GEN	CRISTAL	288	\N	650	1881 SF	\N
370	SEM 77	42950-100	5615-100	22	500	VARIOS	BOT-CR-500 CC- CINTURA	\N	330	\N	650	1816 LF	\N
371	SEM 77	46213	5652-100	48	1050	WARA	BOT-CR-1050 CC-48 GR - WARA	\N	240	\N	510	1881 SF	\N
372	SEM 77	24438-3	\N	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	\N	208	\N	630	1816 LF	\N
373	SEM 77	46493	14875-3	20.6	200	VARIOS	BOT-CR-200 CC-20.6 GR-LICOR GENERICO	\N	500	\N	680	1881 SF	\N
374	SEM 77	46764-3	14876-3	23.16	600	MONTANA	BOT-CR-600 CC-23,16 GR-MONTANA	\N	295	\N	650	\N	\N
375	SEM 77	46828-100	34859-100	31.5	200	VARIOS	BOT-CR-200 CC-31,5 GR - LICOR GENERICO	CRISTAL	500.0	\N	630	1816 LF	\N
376	SEM 77	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
377	SEM 99	14591	5615-3	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330.0	\N	650	1816 LF	\N
378	SEM 99	35144	5638	52	1800	RICKSOY	BOT-CR-1.8 LT - 52 GR NUEVO RICK SOY	CRISTAL	\N	\N	\N	1816 LF	\N
379	SEM 99	7563	5638	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104	\N	550	1816 LF	\N
380	SEM 99	35847	14885	54.6	3000	DELIS	BOT-CR-3 LTS- 54,6 GR - DELIS	CRISTAL	85	\N	550	1881 SF	\N
381	SEM 99	35797	14877	46.66	2000	DELIS	BOT-CR-2.0 LT-46,66 GR - DELIS	CRISTAL	120	\N	600	1881 SF	\N
382	SEM 99	33453	6448	37	900	RICKSOY	BOT-CR-900 CC- 37 GR - RICK SOY	CRISTAL	210	\N	\N	1816 LF	\N
383	SEM 99	36318	7538	37	500	SILOE	BOT - BL- 500 CC - 37 GR BLANCO - SILOE	BLANCO	352	\N	520	1816 LF	\N
384	SEM 99	36309	28618	17.5	300	LEONEL	BOT-CR-300 CC LEONEL	CRISTAL	297	\N	620	1816 LF	\N
385	SEM 99	34792	14877-3	46.6	1100	ACTIVA	BOT-CR-1.1 LT- 46.66 GR SF - ACTIVA	CRISTAL	231	\N	620	1881 SF	\N
386	SEM 99	35307	14877-3	46.6	900	ACTIVA	BOT-CR-0.9 LT- 46.66 GR SF - ACTIVA	CRISTAL	240	\N	\N	1881 SF	\N
387	SEM 99	10346	14875-3	20.6	500	LEONEL	BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL	CRISTAL	340	\N	\N	1881 SF	\N
388	SEM 99	31756	5847	48	900	UNILEVER	BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO	BLANCO	234	\N	650	1816 LF	\N
389	SEM 99	32253	23289-3	52.65	1800	UNILEVER	BOT-CR-1.8 LT-SAP: 68431805- AROMATIC 52.7 GR SHORT FI	CRISTAL	130	\N	620	1881 SF	\N
390	SEM 99	34256	5646-3	56	2000	UNILEVER	BOT-CR-2000 CC-SAP: 68414051- VAJILLERO OLA 56 GR	CRISTAL	117.0	\N	\N	1816 LF	\N
391	SEM 99	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	234	\N	620	1816 LF	\N
392	SEM 99	34918	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 69618454- MAXIMUS 46.66 GR SHORT	CRISTAL	247	\N	\N	1881 SF	\N
393	SEM 99	35809	5652-3	48	1000	UNILEVER	BOT-CR-1 LT-SAP:68493102 -JABON LIZ 48 GR	CRISTAL	143.0	\N	520	1816 LF	\N
394	SEM 99	36107	35858	45	1000	KLBUSINESS	BOT-CR-1 LT -ZUMOBOL	CRISTAL	210	\N	\N	38mm SF	\N
395	SEM 99	36106	35857	27	500	KLBUSINESS	BOT-CR-500 CC-ZUMOBOL	CRISTAL	342	\N	\N	38mm SF	\N
396	SEM 99	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
397	SEM 99	24438	6448	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208.0	\N	640	1816 LF	\N
398	SEM 99	37150	5646-3	56	3000	FREDDY COLQUE	BOT-CR-3 LTS- 56 GR - FREDDY COLQUE	CRISTAL	85.0	\N	\N	1816 LF	\N
399	SEM 99	37426	5621-3	22	500	LEONEL	BOT-VE-500 CC-LEONEL	VERDE	340.0	\N	460	1816 LF	\N
400	SEM 99	31594	5652	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	620	1816 LF	\N
401	SEM 99	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	580	1816 LF	\N
402	SEM 99	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	580	1816 LF	\N
403	SEM 99	37519	12481-3	17.5	300	LEONEL	BOT-VE-300 CC-LEONEL	VERDE	280	\N	500	1816 LF	\N
404	SEM 99	27113	11982	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1816 LF	\N
405	SEM 99	37568	34859-3	31.5	1000	LEONEL	BOT-CR-1 LT- 31,5 GR- LEONEL	CRISTAL	208	\N	620	1881 SF	\N
406	SEM 99	37786	\N	37	1000	LEONEL	BOT-VE-1 LT- 37 GR- LEONEL	VERDE	208	\N	480	1816 LF	\N
407	SEM 99	37814	5652-3	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0	\N	620	1816 LF	\N
408	SEM 99	37829	5615	22	500	LEONEL	BOT-CR-500 CC- LEONEL	CRISTAL	340	\N	500	1816 LF	\N
409	SEM 99	37964	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ENALSIM	VERDE	120.0	\N	650	1816 LF	\N
410	SEM 99	38221	28618-3	17.5	250	TONEL	BOT-CR-250 CC- TONEL	CRISTAL	341	\N	\N	1816 LF	\N
411	SEM 99	38225	14875-3	20.6	500	TONEL	BOT-CR-500 CC- TONEL	CRISTAL	340	\N	\N	1881 SF	\N
412	SEM 99	38226	14876-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213.0	\N	520	1881 SF	\N
413	SEM 99	38251	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
414	SEM 99	38279	34859-3	31.5	1500	TONEL	BOT-CR-1500 CC- TONEL	CRISTAL	169	\N	\N	1881 SF	\N
415	SEM 99	38339	34859-3	31.5	600	ACTIVA	BOT-CR-600 CC- ACTIVA	CRISTAL	364	\N	650	1881 SF	\N
416	SEM 99	38344	28618-3	17.5	230	TONEL	BOT-CR-230 CC- TONEL	CRISTAL	364	\N	\N	1816 LF	\N
417	SEM 99	38442	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC POPULAR- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
418	SEM 99	7272	6448-3	37	1000	VARIOS	BOT-CR-1 LT- 37 GR- GARRAFITA	CRISTAL	182.0	\N	\N	1816 LF	\N
419	SEM 99	38459	5646	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85	\N	500	1816 LF	\N
420	SEM 99	38460	6448	37	1800	VARIOS	BOT-CR-1800 CC- 37 GR - GENERICO VARIOS	CRISTAL	126	\N	\N	1816 LF	\N
421	SEM 99	38481	8235-3	60	2000	UNILEVER	BOT-CR-2000 CC- VAJILLERO OLA 60 GR	CRISTAL	120.0	\N	420	1816 LF	\N
422	SEM 99	38624	28618-3	17.5	300	TONEL	BOT-CR-300 CC- TONEL	CRISTAL	336	\N	\N	1816 LF	\N
423	SEM 99	38827	21006	52	500	PILAR	BOT-BL-500 CC- PILAR	BLANCO	240	\N	650	1816 LF	\N
424	SEM 99	32895	6448	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208.0	\N	620	1816 LF	\N
426	SEM 99	32805	11982	17.5	250	CRUZ	BOT-CR-250 CC- MISTER	CRISTAL	345.0	\N	650	1816 LF	\N
427	SEM 99	39132	28618-3	17.5	110	TONEL	BOT-CR-110 CC- TONEL	CRISTAL	1000	\N	\N	1816 LF	\N
428	SEM 99	39326	5631	28	900	VARIOS	BOT-CR-900 CC- 28 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
429	SEM 99	39582	6448-100	37	1500	BEBIDAS	BOT-CR-1500 CC- BEBIDAS	CRISTAL	161	\N	540	1816 LF	\N
430	SEM 99	39790	5646	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	500	1816 LF	\N
431	SEM 99	39978	14876-3	23.1	700	DEPROAL	BOT-CR-700 CC- DEPROAL	CRISTAL	270	\N	600	1881 SF	\N
432	SEM 99	40140	6448	37	1500	DELYSOY	BOT-CR-1500 CC- DELYSOY	CRISTAL	150.0	\N	550	1816 LF	\N
433	SEM 99	40159	7060	28	350	HAMPY SANA	BOT-BL-350 CC- HAMPY SANA	BLANCO	500	\N	700	1816 LF	\N
434	SEM 99	40160	5652	48	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	\N	1816 LF	\N
435	SEM 99	40491	5631	28	900	DELYSOY	BOT-CR-900 CC- DELYSOY	CRISTAL	247	\N	600	1816 LF	\N
436	SEM 99	40661	5646	56	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	85	\N	\N	1816 LF	\N
437	SEM 99	40954	5646	56	2000	AGUA LUNA	BOT-CR-2000 CC- AGUA LUNA	CRISTAL	120	\N	400	1816 LF	\N
438	SEM 99	40998	14885	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
439	SEM 99	41021	14877	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
440	SEM 99	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
441	SEM 99	42323	34859-3	31.5	1000	DELIS	BOT-CR-1 LT- 31,5 GR- DELIS	CRISTAL	224	\N	500	1881 SF	\N
442	SEM 99	42325	28618-3	17.5	330	DELIS	BOT-CR-330 CC- DELIS	CRISTAL	330	\N	620	1816 LF	\N
443	SEM 99	42324	14876	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
444	SEM 99	27113-3	11982-3	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1881 LF	\N
445	SEM 99	42473	26041-3	42.5	900	ACTIVA	BOT-CR-0.9 LT- 42.5 GR SF - ACTIVA	CRISTAL	240	\N	650	1881 SF	\N
446	SEM 99	42474	34859-3	31.5	200	VARIOS	BOT-CR-200 CC- LICOR RODAS	CRISTAL	500	\N	620	1881 SF	\N
447	SEM 99	7563-3	5638-3	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104.0	\N	630	1881 LF	\N
448	SEM 99	42324-3	14876-3	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	550	1881 SF	\N
449	SEM 99	13736-3	6448-3	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161.0	\N	600	1881 LF	\N
450	SEM 99	42724	14885	54.6	3000	VIMOZ	BOT-CR-3000 CC- VIMOZ	CRISTAL	85	\N	440	1881 SF	\N
451	SEM 99	42950	5615-3	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330.0	\N	550	1816 LF	\N
452	SEM 99	43388	5619-3	22	500	PILAR	BOT-CR-500 CC- PILAR	AZUL	347.0	\N	580	1816 LF	\N
453	SEM 99	40998-3	14885-3	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
454	SEM 99	39790-3	5646-3	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85.0	\N	500	1816 LF	\N
455	SEM 99	38459-3	5646-3	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85.0	\N	500	1816 LF	\N
456	SEM 99	44377	14875-3	20.6	250	ACTIVA	BOT-CR-250 CC- ACTIVA	CRISTAL	392	\N	650	1816 LF	\N
457	SEM 99	32573-100	5615-100	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330	\N	600	1816 LF	\N
458	SEM 99	32692-100	5615-100	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340	\N	650	1816 LF	\N
459	SEM 99	14591-100	5615-100	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330	\N	630	1816 LF	\N
460	SEM 99	41021-3	14877-3	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
461	SEM 99	44688	14885-3	54.6	3000	EPSIS	BOT-CR-3000 CC- EPSIS	CRISTAL	80	\N	500	1881 SF	\N
462	SEM 99	13736-100	6448-100	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	620	1816 LF	\N
463	SEM 99	44772	6448-100	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216	\N	640	1816 LF	\N
464	SEM 99	44773	23289-3	52.65	3000	EPSIS	BOT-CR-3 LT-EPSIS	CRISTAL	85	\N	530	1881 SF	\N
465	SEM 99	24438-100	6448-100	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	630	1816 LF	\N
466	SEM 99	31594-100	5652-100	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	650	1816 LF	\N
467	SEM 99	44898	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295	\N	640	1881 SF	\N
468	SEM 99	32895-100	6448-100	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208	\N	640	1816 LF	\N
469	SEM 99	39790-100	5646-100	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	530	1816 LF	\N
470	SEM 99	37814-100	5652-100	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126	\N	620	1816 LF	\N
471	SEM 99	42324-100	14876-100	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	620	1881 SF	\N
472	SEM 99	40597	34859-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213	\N	440	1881 SF	\N
473	SEM 99	45065	5646-100	56	3000	BIOFITNE	BOT-CR-3 LTS- 56 GR - BIOFITNE	CRISTAL	85	\N	250	1816 LF	\N
474	SEM 99	45421	6448-100	37	1050	VARIOS	BOT-CR-1.050 CC-37 GR-VAJILLERO GEN	CRISTAL	204	\N	630	1816 LF	\N
475	SEM 99	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
476	SEM 99	45854	14877-3	46.66	1050	WARA	BOT-CR-1050 CC-46.6 GR - WARA	\N	240	\N	510	1881 SF	\N
477	SEM 99	45791	\N	22	500	INTERNATIONALGO	BOT-CR-500 CC-22 GR -3 INTERNATIONALGO	CRISTAL	330	\N	620	1816 LF	\N
478	SEM 99	45853	34859-3	31.5	500	WARA	BOT-CR-500 CC-31,5 GR - WARA	CRISTAL	336	\N	630	1881 SF	\N
479	SEM 99	45870	34859-3	31.5	200	FLORENTINO	BOT-CR-200 CC-31.5 GR-LICOR FLORENTINO	CRISTAL	500	\N	650	1881 SF	\N
480	SEM 99	45719	14876-100	23.16	500	VARIOS	BOT. CR-500 CC-23.16 GR SF-VAJILLERO GEN	CRISTAL	288	\N	650	1881 SF	\N
481	SEM 99	42950-100	5615-100	22	500	VARIOS	BOT-CR-500 CC- CINTURA	\N	330	\N	650	1816 LF	\N
482	SEM 99	46213	5652-100	48	1050	WARA	BOT-CR-1050 CC-48 GR - WARA	\N	240	\N	510	1881 SF	\N
483	SEM 99	24438-3	\N	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	\N	208	\N	630	1816 LF	\N
484	SEM 99	46493	14875-3	20.6	200	VARIOS	BOT-CR-200 CC-20.6 GR-LICOR GENERICO	\N	500	\N	680	1881 SF	\N
485	SEM 99	46764-3	14876-3	23.16	600	MONTANA	BOT-CR-600 CC-23,16 GR-MONTANA	\N	295	\N	650	\N	\N
543	SEM 106	27113	11982	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1816 LF	\N
486	SEM 99	46828-100	34859-100	31.5	200	VARIOS	BOT-CR-200 CC-31,5 GR - LICOR GENERICO	CRISTAL	500.0	\N	630	1816 LF	\N
487	SEM 50	20244	16144	93	5000	VARIOS	BOT.CR 5.0 LT-93 GR GENERICO	CRISTAL	49	\N	330	48mm SF	\N
488	SEM 50	31306	16144-3	93	5000	UNILEVER	BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR	CRISTAL	42	\N	340	48mm SF	\N
489	SEM 50	32571	23502	93	5000	UNILEVER	BOT-LILA-5 LT-SAP:68474221- UNILEVER 93 GR	LILA	42	\N	330	48mm SF	\N
490	SEM 50	33904	22104	93	5000	UNILEVER	BOT-AZ-5 LT-SAP: 68474223-UNILEVER 93 GR AZUL PLENO	AZUL	42	\N	330	48mm SF	\N
491	SEM 50	33905	23500	93	5000	UNILEVER	BOT- FUCSIA PLENO- 5 LT- 93 GR UNILEVER	FUCSIA	42	\N	330	48mm SF	\N
492	SEM 50	33964	21108	93	5000	UNILEVER	BOT-BL-5 LT-SAP: 68762574-UNILEVER 93 GR BLANCO PLENO	BLANCO	42	\N	340	48mm SF	\N
493	SEM 50	38177	16144-3	93	5000	VARIOS	BOT.CR 5.0 LT-93 GR TONEL	CRISTAL	49	\N	300	48mm SF	\N
494	SEM 50	39317	16144	93	6000	VARIOS	BOT.CR 6.0 LT-93 GR GENERICO TUBULAR	CRISTAL	42	\N	320	48mm SF	\N
495	SEM 50	39317-3	16144-3	93	6000	VARIOS	BOT.CR 6.0 LT-93 GR GENERICO TUBULAR	CRISTAL	42	\N	320	48mm SF	\N
496	SEM 50	20244-3	16144-3	93	5000	VARIOS	BOT.CR 5.0 LT-93 GR GENERICO	CRISTAL	49	\N	330	48mm SF	\N
497	SEM 78	36299	14885	54.6	3000	LEONEL	BOT-CR-3.0 LT 54.6 GR-SF LEONEL	CRISTAL	80	\N	4500	1881 SF	6
498	SEM 78	31901	14877	46.6	2000	LEONEL	BOT-CR-2000 CC-46.66 GR SF - LEONEL	CRISTAL	120	\N	6000	1881 SF	6
499	SEM 78	43826	14885-3	54.6	3000	LEONEL	BOT-CR-3.0 LT 54.6 GR-SF LEONEL	CRISTAL	80	\N	4800	1881 SF	6
500	SEM 78	44406	14877-3	46.66	2000	VIAMONT	BOT-CR-2 LTS - 46,66GR GENERICA	CRISTAL	114	\N	4000	1881 SF	4
501	SEM 78	44427	25100-3	56.7	3000	LEONEL	BOT-CR-3.0 LT 56,7 GR-SF LEONEL	CRISTAL	80	\N	4500	1881 SF	6
502	SEM 78	31901-3	14877-3	46.6	2000	LEONEL	BOT-CR-2000 CC-46.66 GR SF - LEONEL	CRISTAL	120	\N	6000	1881 SF	6
503	SEM 78	7200-100	5646-100	56	3000	VARIOS	BOT-CR-3.0 LT-56 GR-GENERICO	CRISTAL	80	\N	3200	1816 LF	4
504	SEM 78	26407-100	5652-100	48	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	CRISTAL	120	\N	3800	1816 LF	4
505	SEM 78	30149-100	5646-100	56	3000	LAUVAL	BOT-CR-3.0 LT 56 GR-LAUVAL	CRISTAL	80	\N	3500	1816 LF	2
506	SEM 78	14590-100	5615-100	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295	\N	3800	1816 LF	4
507	SEM 78	7200-3	5646-3	56	3000	VARIOS	BOT-CR-3.0 LT-56 GR-GENERICO	CRISTAL	80	\N	3200	1816 LF	4
508	SEM 78	15649	5621-3	22	600	BEBIDAS	BOT-VE-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	VERDE	295	\N	3800	1816 LF	4
509	SEM 78	45566	14885-3	54.6	3000	VARIOS	BOT. CR-3 L-54,6 GR.-GEN	\N	80	\N	4000	1881 SF	4
510	SEM 78	26407-3	5652-3	48	2000	VARIOS	BOT-CR-2 LITROS SPORT GENERICA NUEVO MOLDE	CRISTAL	120.0	\N	4000	1816 LF	\N
511	SEM 78	34118-3	5652-3	48	1800	DELYSOY	BOT-CR-1800 CC- 48 GR - DELY SOY	CRISTAL	126	\N	4000	1816 LF	\N
512	SEM 78	19739-100	5652-100	48	2000	VARIOS	BOT-CR-2 LTS-48 GR GENERICA	CRISTAL	114	\N	4000	1816 LF	4
513	SEM 78	46494	\N	42.5	2000	EBA	BOT-CR-2 LTS - 42,5 GR CINTURA SHORT FINISH	\N	\N	\N	3800	1881 SF	\N
514	SEM 78	47269	14885-3	54.6	3000	HARRY LIMONERO	BOT-CR-3.0 LT 54.6 GR-SF HARRY LIMONERO	CRISTAL	80	\N	4800	1881 SF	2
515	SEM 78	14590	5615-3	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295	\N	4000	1816 LF	\N
516	SEM 106	14591	5615-3	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330.0	\N	650	1816 LF	\N
517	SEM 106	35144	5638	52	1800	RICKSOY	BOT-CR-1.8 LT - 52 GR NUEVO RICK SOY	CRISTAL	\N	\N	\N	1816 LF	\N
518	SEM 106	7563	5638	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104	\N	550	1816 LF	\N
519	SEM 106	35847	14885	54.6	3000	DELIS	BOT-CR-3 LTS- 54,6 GR - DELIS	CRISTAL	85	\N	\N	1881 SF	\N
520	SEM 106	35797	14877	46.66	2000	DELIS	BOT-CR-2.0 LT-46,66 GR - DELIS	CRISTAL	120	\N	\N	1881 SF	\N
521	SEM 106	33453	6448	37	900	RICKSOY	BOT-CR-900 CC- 37 GR - RICK SOY	CRISTAL	210		650	1816 LF	\N
522	SEM 106	36318	7538	37	500	SILOE	BOT - BL- 500 CC - 37 GR BLANCO - SILOE	BLANCO	352	\N	520	1816 LF	\N
523	SEM 106	36309	28618	17.5	300	LEONEL	BOT-CR-300 CC LEONEL	CRISTAL	297.0	\N	620	1816 LF	\N
524	SEM 106	34792	14877-3	46.6	1100	ACTIVA	BOT-CR-1.1 LT- 46.66 GR SF - ACTIVA	CRISTAL	231	\N	520	1881 SF	\N
525	SEM 106	35307	14877-3	46.6	900	ACTIVA	BOT-CR-0.9 LT- 46.66 GR SF - ACTIVA	CRISTAL	240	\N	\N	1881 SF	\N
526	SEM 106	10346	14875-3	20.6	500	LEONEL	BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL	CRISTAL	340.0	\N	600	1881 SF	\N
527	SEM 106	31756	5847	48	900	UNILEVER	BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO	BLANCO	234	\N	650	1816 LF	\N
528	SEM 106	32253	23289-3	52.65	1800	UNILEVER	BOT-CR-1.8 LT-SAP: 68431805- AROMATIC 52.7 GR SHORT FI	CRISTAL	130	\N	580	1881 SF	\N
529	SEM 106	34256	5646-3	56	2000	UNILEVER	BOT-CR-2000 CC-SAP: 68414051- VAJILLERO OLA 56 GR	CRISTAL	117.0	\N	\N	1816 LF	\N
530	SEM 106	34349	34103-3	48	900	UNILEVER	BOT-NEGRO-0.9 LT-SAP: 68482907 LIZ 48 GR	NEGRO	234	\N	620	1816 LF	\N
531	SEM 106	34918	14877-3	46.6	900	UNILEVER	BOT-CR-0.900 LT-SAP: 69618454- MAXIMUS 46.66 GR SHORT	CRISTAL	247	\N	\N	1881 SF	\N
532	SEM 106	35809	5652-3	48	1000	UNILEVER	BOT-CR-1 LT-SAP:68493102 -JABON LIZ 48 GR	CRISTAL	143.0	\N	520	1816 LF	\N
533	SEM 106	36107	35858	45	1000	KLBUSINESS	BOT-CR-1 LT -ZUMOBOL	CRISTAL	210	\N	\N	38mm SF	\N
534	SEM 106	36106	35857	27	500	KLBUSINESS	BOT-CR-500 CC-ZUMOBOL	CRISTAL	342	\N	\N	38mm SF	\N
535	SEM 106	13736	6448	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
536	SEM 106	24438	6448	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208.0	\N	600	1816 LF	\N
537	SEM 106	37150	5646-3	56	3000	FREDDY COLQUE	BOT-CR-3 LTS- 56 GR - FREDDY COLQUE	CRISTAL	85.0	\N	\N	1816 LF	\N
538	SEM 106	37426	5621-3	22	500	LEONEL	BOT-VE-500 CC-LEONEL	VERDE	340.0	\N	460	1816 LF	\N
539	SEM 106	31594	5652	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	620	1816 LF	\N
540	SEM 106	35848	6794-3	37	1000	VARIOS	BOT-VE-1 LT- 37 GR- ONDA GENERICO	VERDE	208.0	\N	580	1816 LF	\N
541	SEM 106	35849	6794-3	37	1500	VARIOS	BOT-VE-1.5 LTS- 37 GR- ESTRIADA GENERICO	VERDE	161.0	\N	580	1816 LF	\N
542	SEM 106	37519	12481-3	17.5	300	LEONEL	BOT-VE-300 CC-LEONEL	VERDE	280	\N	500	1816 LF	\N
544	SEM 106	37568	34859-3	31.5	1000	LEONEL	BOT-CR-1 LT- 31,5 GR- LEONEL	CRISTAL	208	\N	620	1881 SF	\N
545	SEM 106	37786	\N	37	1000	LEONEL	BOT-VE-1 LT- 37 GR- LEONEL	VERDE	208	\N	480	1816 LF	\N
546	SEM 106	37814	5652-3	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0	\N	620	1816 LF	\N
547	SEM 106	37829	5615	22	500	LEONEL	BOT-CR-500 CC- LEONEL	CRISTAL	340	\N	500	1816 LF	\N
548	SEM 106	37964	5659-3	48	2000	BEBIDAS	BOT-VE-2.000 CC-48-GR-ENALSIM	VERDE	120.0	\N	650	1816 LF	\N
549	SEM 106	38221	28618-3	17.5	250	TONEL	BOT-CR-250 CC- TONEL	CRISTAL	341	\N	\N	1816 LF	\N
550	SEM 106	38225	14875-3	20.6	500	TONEL	BOT-CR-500 CC- TONEL	CRISTAL	340	\N	\N	1881 SF	\N
551	SEM 106	38226	14876-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213.0	\N	520	1881 SF	\N
552	SEM 106	38251	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
553	SEM 106	38279	34859-3	31.5	1500	TONEL	BOT-CR-1500 CC- TONEL	CRISTAL	169	\N	\N	1881 SF	\N
554	SEM 106	38339	34859-3	31.5	600	ACTIVA	BOT-CR-600 CC- ACTIVA	CRISTAL	364	\N	620	1881 SF	\N
555	SEM 106	38344	28618-3	17.5	230	TONEL	BOT-CR-230 CC- TONEL	CRISTAL	364	\N	\N	1816 LF	\N
556	SEM 106	38442	34859-3	31.5	1000	TONEL	BOT-CR-1000 CC POPULAR- TONEL	CRISTAL	208	\N	\N	1881 SF	\N
557	SEM 106	7272	6448-3	37	1000	VARIOS	BOT-CR-1 LT- 37 GR- GARRAFITA	CRISTAL	182.0	\N	\N	1816 LF	\N
558	SEM 106	38459	5646	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85	\N	500	1816 LF	\N
559	SEM 106	38460	6448	37	1800	VARIOS	BOT-CR-1800 CC- 37 GR - GENERICO VARIOS	CRISTAL	126	\N	\N	1816 LF	\N
560	SEM 106	38481	8235-3	60	2000	UNILEVER	BOT-CR-2000 CC- VAJILLERO OLA 60 GR	CRISTAL	120.0	\N	420	1816 LF	\N
561	SEM 106	38624	28618-3	17.5	300	TONEL	BOT-CR-300 CC- TONEL	CRISTAL	336	\N	\N	1816 LF	\N
562	SEM 106	38827	21006	52	500	PILAR	BOT-BL-500 CC- PILAR	BLANCO	240	\N	650	1816 LF	\N
563	SEM 106	32895	6448	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208.0	\N	620	1816 LF	\N
564	SEM 106	32692	5615	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340.0	\N	620	1816 LF	\N
565	SEM 106	32805	11982	17.5	250	CRUZ	BOT-CR-250 CC- MISTER	CRISTAL	345.0	\N	650	1816 LF	\N
566	SEM 106	39132	28618-3	17.5	110	TONEL	BOT-CR-110 CC- TONEL	CRISTAL	1000	\N	\N	1816 LF	\N
567	SEM 106	39326	5631	28	900	VARIOS	BOT-CR-900 CC- 28 GR - GENERICO	CRISTAL	238	\N	600	1816 LF	\N
568	SEM 106	39582	6448-100	37	1500	BEBIDAS	BOT-CR-1500 CC- BEBIDAS	CRISTAL	161	\N	580	1816 LF	\N
569	SEM 106	39790	5646	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	450	1816 LF	\N
570	SEM 106	39978	14876-3	23.1	700	DEPROAL	BOT-CR-700 CC- DEPROAL	CRISTAL	270	\N	600	1881 SF	\N
571	SEM 106	40140	6448	37	1500	DELYSOY	BOT-CR-1500 CC- DELYSOY	CRISTAL	150.0	\N	550	1816 LF	\N
572	SEM 106	40159	7060	28	350	HAMPY SANA	BOT-BL-350 CC- HAMPY SANA	BLANCO	500	\N	700	1816 LF	\N
573	SEM 106	40160	5652	48	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	\N	1816 LF	\N
574	SEM 106	40491	5631	28	900	DELYSOY	BOT-CR-900 CC- DELYSOY	CRISTAL	247	\N	550	1816 LF	\N
575	SEM 106	40661	5646	56	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	85	\N	\N	1816 LF	\N
576	SEM 106	40954	5646	56	2000	AGUA LUNA	BOT-CR-2000 CC- AGUA LUNA	CRISTAL	120	\N	400	1816 LF	\N
577	SEM 106	40998	14885	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
578	SEM 106	41021	14877	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	540	1881 SF	\N
579	SEM 106	32573	5615-3	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330.0	\N	540	1816 LF	\N
580	SEM 106	42323	34859-3	31.5	1000	DELIS	BOT-CR-1 LT- 31,5 GR- DELIS	CRISTAL	224	\N	500	1881 SF	\N
581	SEM 106	42325	28618-3	17.5	330	DELIS	BOT-CR-330 CC- DELIS	CRISTAL	330	\N	600	1881 SF	\N
582	SEM 106	42324	14876	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	640	1881 SF	\N
583	SEM 106	27113-3	11982-3	17.5	330	VARIOS	BOT. CR DE 330 ML DE 17,5 GR	CRISTAL	294	\N	600	1881 LF	\N
584	SEM 106	42473	26041-3	42.5	900	ACTIVA	BOT-CR-0.9 LT- 42.5 GR SF - ACTIVA	CRISTAL	240	\N	520	1881 SF	\N
585	SEM 106	42474	34859-3	31.5	200	VARIOS	BOT-CR-200 CC- LICOR RODAS	CRISTAL	500	\N	640	1881 SF	\N
586	SEM 106	7563-3	5638-3	52	2500	VARIOS	BOT-CR-2.5 LT-52GR-GENERICA	CRISTAL	104.0	\N	600	1881 LF	\N
587	SEM 106	42324-3	14876-3	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	640	1881 SF	\N
588	SEM 106	13736-3	6448-3	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161.0	\N	600	1881 LF	\N
589	SEM 106	42724	14885	54.6	3000	VIMOZ	BOT-CR-3000 CC- VIMOZ	CRISTAL	85	\N	450	1881 SF	\N
590	SEM 106	42950	5615-3	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330.0	\N	550	1816 LF	\N
591	SEM 106	43388	5619-3	22	500	PILAR	BOT-CR-500 CC- PILAR	AZUL	347.0	\N	580	1816 LF	\N
592	SEM 106	40998-3	14885-3	54.6	3000	MASIVOS	BOT-CR-3000 CC- MASIVOS	CRISTAL	80	\N	500	1881 SF	\N
593	SEM 106	39790-3	5646-3	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85.0	\N	500	1816 LF	\N
594	SEM 106	38459-3	5646-3	56	3000	PROLIBO	BOT-CR-3 LTS- 56 GR - PROLIBO	CRISTAL	85.0	\N	500	1816 LF	\N
595	SEM 106	44377	14875-3	20.6	250	ACTIVA	BOT-CR-250 CC- ACTIVA	CRISTAL	392	\N	650	1816 LF	\N
596	SEM 106	32573-100	5615-100	22	600	VARIOS	BOT-CR-600 CC - 22 GR - SWIRL	CRISTAL	330	\N	600	1816 LF	\N
597	SEM 106	32692-100	5615-100	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340	\N	620	1816 LF	\N
598	SEM 106	14591-100	5615-100	22	660	BEBIDAS	BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A	CRISTAL	330	\N	650	1816 LF	\N
599	SEM 106	41021-3	14877-3	46.66	2000	MASIVOS	BOT-CR-2000 CC- MASIVOS	CRISTAL	120	\N	520	1881 SF	\N
600	SEM 106	44688	14885-3	54.6	3000	EPSIS	BOT-CR-3000 CC- EPSIS	CRISTAL	80	\N	500	1881 SF	\N
601	SEM 106	13736-100	6448-100	37	1500	VARIOS	BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A	CRISTAL	161	\N	600	1816 LF	\N
602	SEM 106	44772	6448-100	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216	\N	640	1816 LF	\N
603	SEM 106	44773	23289-3	52.65	3000	EPSIS	BOT-CR-3 LT-EPSIS	CRISTAL	85	\N	530	1881 SF	\N
604	SEM 106	24438-100	6448-100	37	1000	VARIOS	BOTELLAS CRISTAL 1LT. 37GR. ONDA GENERICO	CRISTAL	208	\N	600	1816 LF	\N
605	SEM 106	31594-100	5652-100	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120	\N	620	1816 LF	\N
606	SEM 106	44898	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295	\N	640	1881 SF	\N
607	SEM 106	32895-100	6448-100	37	1000	CRUZ	BOT-CR-1 LT- 37 GR- MISTER	CRISTAL	208	\N	620	1816 LF	\N
608	SEM 106	39790-100	5646-100	56	3000	BENAFON	BOT-CR-3 LTS- 56 GR - BENAFON	CRISTAL	85	\N	530	1816 LF	\N
609	SEM 106	37814-100	5652-100	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126	\N	620	1816 LF	\N
610	SEM 106	42324-100	14876-100	23.16	200	VARIOS	BOT-CR-200 CC- LICOR GENERICO	CRISTAL	500	\N	660	1881 SF	\N
611	SEM 106	40597	34859-3	31.5	360	ACTIVA	BOT-CR-360 CC- ACTIVA	CRISTAL	213	\N	440	1881 SF	\N
612	SEM 106	45065	5646-100	56	3000	BIOFITNE	BOT-CR-3 LTS- 56 GR - BIOFITNE	CRISTAL	85	\N	250	1816 LF	\N
613	SEM 106	45421	6448-100	37	1050	VARIOS	BOT-CR-1.050 CC-37 GR-VAJILLERO GEN	CRISTAL	204	\N	630	1816 LF	\N
614	SEM 106	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
615	SEM 106	45854	14877-3	46.66	1050	WARA	BOT-CR-1050 CC-46.6 GR - WARA	CRISTAL	240	\N	510	1881 SF	\N
616	SEM 106	45791	\N	22	500	INTERNATIONALGO	BOT-CR-500 CC-22 GR -3 INTERNATIONALGO	CRISTAL	330	\N	620	1816 LF	\N
617	SEM 106	45853	34859-3	31.5	500	WARA	BOT-CR-500 CC-31,5 GR - WARA	CRISTAL	336	\N	630	1881 SF	\N
618	SEM 106	45870	34859-3	31.5	200	FLORENTINO	BOT-CR-200 CC-31.5 GR-LICOR FLORENTINO	CRISTAL	500	\N	650	1881 SF	\N
619	SEM 106	45719	14876-100	23.16	500	VARIOS	BOT. CR-500 CC-23.16 GR SF-VAJILLERO GEN	CRISTAL	288	\N	650	1881 SF	\N
620	SEM 106	42950-100	5615-100	22	500	VARIOS	BOT-CR-500 CC- CINTURA	CRISTAL	330	\N	650	1816 LF	\N
621	SEM 106	46213	5652-100	48	1050	WARA	BOT-CR-1050 CC-48 GR - WARA	CRISTAL	240	\N	510	1881 SF	\N
622	SEM 106	46493	14875-3	20.6	200	VARIOS	BOT-CR-200 CC-20.6 GR-LICOR GENERICO	CRISTAL	500	\N	680	1881 SF	\N
623	SEM 106	46828-100	34859-100	31.5	200	VARIOS	BOT-CR-200 CC-31,5 GR - LICOR GENERICO	CRISTAL	500.0	\N	630	1816 LF	\N
624	SEM 77	47939-3	28618-3	17.5	250	WARA	BOT-CR-250 CC-17.5 GR-WARA	CRISTAL	448.0	4480.0	600	\N	\N
625	SEM 48	46748-100	6448-100	37	1000	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	CRISTAL	182.0	\N	600	1816 SF	\N
626	SEM 66	46748-100	6448-100	37	\N	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	\N	182.0	\N	600	\N	\N
627	SEM 77	46748-100	6448-100	37	1000	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	CRISTAL	182.0	\N	600	1816 SF	\N
628	SEM 99	46748-100	6448-100	37	1000	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	CRISTAL	182.0	\N	600	1816 SF	\N
629	SEM 106	46748-100	6448-100	37	1000	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	CRISTAL	182.0	\N	600	1816 SF	\N
630	SEM 139	46748-100	6448-100	37	1000	\N	BOT-CR-1.0 LT-37 GR-GARRAFITA GENERICA	CRISTAL	182.0	\N	600	1816 SF	\N
631	SEM 48	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
632	SEM 63	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
633	SEM 77	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
634	SEM 99	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
635	SEM 106	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
636	SEM 139	46660-3	5615-3	22	\N	\N	BOT-CR-500 CC-22 GR-GARRAFITA GENERICA	\N	304.0	\N	600	\N	\N
641	SEM 106	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
643	SEM 48	47939-3	28618-3	17.5	250	WARA	BOT-CR-250 CC-17.5 GR-WARA	CRISTAL	448.0	4480.0	600	\N	\N
644	SEM 77	47939-3	28618-3	17.5	250	WARA	BOT-CR-250 CC-17.5 GR-WARA	CRISTAL	448.0	4480.0	600	\N	\N
645	SEM 99	47939-3	28618-3	17.5	250	WARA	BOT-CR-250 CC-17.5 GR-WARA	CRISTAL	448.0	4480.0	600	\N	\N
646	SEM 48	38339-100	34859-100	31.5	600	\N	\N	\N	\N	\N	680	\N	\N
647	SEM 77	38339-100	34859-100	31.5	600	\N	\N	\N	\N	\N	680	\N	\N
648	SEM 99	38339-100	34859-100	31.5	600	\N	\N	\N	\N	\N	680	\N	\N
649	SEM 106	38339-100	34859-100	31.5	600	\N	\N	\N	\N	\N	680	\N	\N
650	SEM 139	38339-100	34859-100	31.5	600	\N	\N	\N	\N	\N	680	\N	\N
653	SEM 48	32692	5615	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340.0	\N	620	1816 LF	\N
654	SEM 77	32692	5615	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340.0	\N	620	1816 LF	\N
655	SEM 99	32692	5615	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340.0	\N	620	1816 LF	\N
656	SEM 139	32692	5615	22	500	CRUZ	BOT-CR-500 CC- MISTER	CRISTAL	340.0	\N	620	1816 LF	\N
658	SEM 63	14590	5615-3	22	600	BEBIDAS	BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.	CRISTAL	295.0	\N	4000	1816 LF	\N
659	SEM 48	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
660	SEM 50	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
661	SEM 66	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
662	SEM 77	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
663	SEM 99	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
664	SEM 106	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
665	SEM 139	7096	5615-3	22	600	VARIOS	BOTELLA 600ML ONDA (STA CRUZ)	CRISTAL	\N	\N	680	LF	\N
666	SEM 48	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
667	SEM 50	39326-3	6448-100	37	900	VARIOS	BOT-CR-900 CC-37 GR -100 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
668	SEM 66	39326-3	6448-100	37	900	VARIOS	BOT-CR-900 CC-37 GR -100 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
669	SEM 77	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
670	SEM 99	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
671	SEM 106	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
672	SEM 139	39326-3	5631-3	28	900	VARIOS	BOT-CR-900 CC-28 GR -3 GENERICO	CRISTAL	238.0	\N	620	1816 LF	\N
673	SEM 48	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
674	SEM 50	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
675	SEM 66	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
676	SEM 77	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
677	SEM 99	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
678	SEM 106	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
679	SEM 139	48641-100	34859-100	31.5	1000	MONTANA	BOT-CR-1000 CC-31.5 GR-MONTANA	CRISTAL	208.0	\N	680	SF	\N
680	SEM 63	34118	5652	48	1800	DELYSOY	BOT-CR-1800 CC- 48 GR - DELY SOY	CRISTAL	126.0	\N	4000	1816 LF	\N
681	SEM 78	34118	5652	48	1800	DELYSOY	BOT-CR-1800 CC- 48 GR - DELY SOY	CRISTAL	126.0	\N	4000	1816 LF	\N
682	SEM 48	44898-3	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295.0	\N	640	1881 SF	\N
683	SEM 77	44898-3	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295.0	\N	640	1881 SF	\N
684	SEM 99	44898-3	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295.0	\N	640	1881 SF	\N
685	SEM 106	44898-3	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295.0	\N	640	1881 SF	\N
686	SEM 139	44898-3	14875-3	20.6	600	MONTANA	BOT-CR-600 CC- MONTANA	CRISTAL	295.0	\N	640	1881 SF	\N
687	SEM 48	44772-3	6448-3	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216.0	\N	640	1816 LF	\N
688	SEM 77	44772-3	6448-3	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216.0	\N	640	1816 LF	\N
689	SEM 99	44772-3	6448-3	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216.0	\N	640	1816 LF	\N
690	SEM 106	44772-3	6448-3	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216.0	\N	640	1816 LF	\N
691	SEM 139	44772-3	6448-3	37	1100	SIGMA	BOT-CR-1.100 CC-37-GR-SIGMA	CRISTAL	216.0	\N	640	1816 LF	\N
692	SEM 63	47432-100	6448-100	37	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	VERDE	\N	\N	4000	1816LF	\N
693	SEM 78	47432-100	6448-100	37	2000	VARIOS	BOT-CR-2 LITROS GENERICA NUEVO MOLDE	VERDE	\N	\N	4000	1816LF	\N
694	SEM 48	45719-3	14876-3	\N	500	VARIOS	BOT-CR-500CC-23.16GR-SF-VAJILLERO GEN	CRISTAL	\N	\N	650	1881 SF	\N
695	SEM 77	45719-3	14876-3	\N	500	VARIOS	BOT-CR-500CC-23.16GR-SF-VAJILLERO GEN	CRISTAL	\N	\N	650	1881 SF	\N
696	SEM 99	45719-3	14876-3	\N	500	VARIOS	BOT-CR-500CC-23.16GR-SF-VAJILLERO GEN	CRISTAL	\N	\N	650	1881 SF	\N
697	SEM 106	45719-3	14876-3	23.16	500	VARIOS	BOT-CR-500CC-23.16GR-SF-VAJILLERO GEN	CRISTAL			650	1881 SF	\N
698	SEM 139	45719-3	14876-3	\N	500	VARIOS	BOT-CR-500CC-23.16GR-SF-VAJILLERO GEN	CRISTAL	\N	\N	650	1881 SF	\N
699	SEM 48	46782-100	6448-100	37	500	WARA	BOT-CR-500 CC-37 GR-WARA	CRISTAL	\N	\N	\N	1816 SF	\N
700	SEM 77	46782-100	6448-100	37	500	WARA	BOT-CR-500 CC-37 GR-WARA	CRISTAL	\N	\N	\N	1816 SF	\N
701	SEM 99	46782-100	6448-100	37	500	WARA	BOT-CR-500 CC-37 GR-WARA	CRISTAL	\N	\N	\N	1816 SF	\N
702	SEM 106	46782-100	6448-100	37	500	WARA	BOT-CR-500 CC-37 GR-WARA	CRISTAL	\N	\N	\N	1816 SF	\N
703	SEM 139	46782-100	6448-100	37	500	WARA	BOT-CR-500 CC-37 GR-WARA	CRISTAL	\N	\N	\N	1816 SF	\N
704	SEM 66	46798-100	5652-100	48	1500	\N	\N	CRISTAL	\N	\N	\N	1816 LF	\N
706	SEM 48	49407-3	14877-3	46.6	2000	REFRESH	BOT-CR-2000 CC REFRESH -46,6G-3	CRISTAL	120.0	\N	640	1881	\N
707	SEM 77	49407-3	14877-3	46.6	2000	REFRESH	BOT-CR-2000 CC REFRESH -46,6G-3	CRISTAL	120.0	\N	640	1881	\N
708	SEM 99	49407-3	14877-3	46.6	2000	REFRESH	BOT-CR-2000 CC REFRESH -46,6G-3	CRISTAL	120.0	\N	640	1881	\N
709	SEM 106	49407-3	14877-3	46.6	2000	REFRESH	BOT-CR-2000 CC REFRESH -46,6G-3	CRISTAL	120.0	\N	640	1881	\N
710	SEM 139	49407-3	14877-3	46.6	2000	REFRESH	BOT-CR-2000 CC REFRESH -46,6G-3	CRISTAL	120.0	\N	640	1881	\N
711	SEM 48	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
712	SEM 50	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
713	SEM 77	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
714	SEM 99	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
715	SEM 106	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
716	SEM 139	49849-3	\N	\N	500	VARIOS	BOT - CR - 500 CC-24,5GR-3  - CUADRADO GENERICO	CRISTAL	378.0	\N	680	\N	\N
717	SEM 63	5910	5847	48	2000	VARIOS	BOT-BL-2000 SPORT	BLANCO	120.0	\N	3800	\N	\N
718	SEM 78	5910	5847	48	2000	VARIOS	BOT-BL-2000 SPORT	BLANCO	120.0	\N	3800	\N	\N
719	SEM 99	50192-3	28618-3	17.5	330	VARIOS	BOT-CR-330 CC-17,5g-3-SF-ONDA GENERICO	CRISTAL	294.0	\N	670	1881 SF	2
720	SEM 77	50192-3	28618-3	17.5	330	VARIOS	BOT-CR-330 CC-17,5g-3-SF-ONDA GENERICO	CRISTAL	294.0	\N	670	1881 SF	2
721	SEM 48	50192-3	28618-3	17.5	330	VARIOS	BOT-CR-330 CC-17,5g-3-SF-ONDA GENERICO	CRISTAL	294.0	\N	670	1881 SF	2
722	SEM 106	50192-3	28618-3	17.5	330	VARIOS	BOT-CR-330 CC-17,5g-3-SF-ONDA GENERICO	CRISTAL	294.0	\N	670	1881 SF	2
723	SEM 139	50192-3	28618-3	17.5	330	VARIOS	BOT-CR-330 CC-17,5g-3-SF-ONDA GENERICO	CRISTAL	294.0	\N	670	1881 SF	2
724	SEM 48	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
725	SEM 50	37814-3	\N	\N	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	\N	\N
726	SEM 66	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
727	SEM 77	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
728	SEM 99	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
729	SEM 106	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
730	SEM 139	37814-3	5652-3	48	1800	VARIOS	BOT-CR-1800 ACEITERO GENERICO	CRISTAL	126.0	\N	650	1816	\N
731	SEM 48	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
732	SEM 50	49850-3	\N	\N	3000	BENAFON	BOT-CR-3000 BENAFON	CRISTAL	85.0	\N	550	\N	\N
733	SEM 66	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
734	SEM 77	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
735	SEM 99	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
736	SEM 106	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
737	SEM 139	49850-3	5638-3	52	3000	BENAFON	BOT-CR-3000 BENAFON-52 G	CRISTAL	85.0	\N	550	1816	\N
738	SEM 66	26407-3	5652-3	48	2000	VARIOS	BOT-CR-2 LITROS SPORT GENERICA NUEVO MOLDE	CRISTAL	120.0	\N	4000	1816 LF	\N
739	SEM 99	46493-100	14875-100	20.6	200	Varios	BOT-CR-200 CC-20.6 GR-100-LICOR	CRISTAL	500		700	\N	\N
740	SEM 77	46493-100	14875-100	20.6	200	Varios	BOT-CR-200 CC-20.6 GR-100-LICOR	CRISTAL	500		700	\N	\N
741	SEM 48	46493-100	14875-100	20.6	200	Varios	BOT-CR-200 CC-20.6 GR-100-LICOR	CRISTAL	500		700	\N	\N
742	SEM 106	46493-100	14875-100	20.6	200	Varios	BOT-CR-200 CC-20.6 GR-100-LICOR	CRISTAL	500		700	\N	\N
743	SEM 139	46493-100	14875-100	20.6	200	Varios	BOT-CR-200 CC-20.6 GR-100-LICOR	CRISTAL	500		700	\N	\N
744	SEM 99	111111		20.6	500	VARIOS	BOT-CR-500 GARRAFITA 20,6G-100	CRISTAL	500		670	\N	\N
745	SEM 77	111111		20.6	500	VARIOS	BOT-CR-500 GARRAFITA 20,6G-100	CRISTAL	500		670	\N	\N
746	SEM 48	111111		20.6	500	VARIOS	BOT-CR-500 GARRAFITA 20,6G-100	CRISTAL	500		670	\N	\N
747	SEM 106	111111		20.6	500	VARIOS	BOT-CR-500 GRANADITA 20,6G-100	CRISTAL	500		670	\N	\N
748	SEM 139	111111		20.6	500	VARIOS	BOT-CR-500 GARRAFITA 20,6G-100	CRISTAL	500		670	\N	\N
750	SEM 77	22222		17.5	250	VARIOS	BOT-CR-250CC GRANADITA 17,5 SF	CRISTAL	500		680	\N	\N
754	SEM 99	31594	5652-3	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120		620	1816 LF	\N
755	SEM 77	31594	5652-3	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120		620	1816 LF	\N
756	SEM 48	31594	5652-3	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120		620	1816 LF	\N
757	SEM 106	31594	5652-3	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120		620	1816 LF	\N
758	SEM 139	31594	5652-3	48	2000	BEBIDAS	BOT-CR-2 LTS-48 GR ENALSSIN	CRISTAL	120		620	1816 LF	\N
759	SEM 99	37814	5652	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0		620	1816 LF	\N
760	SEM 77	37814	5652	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0		620	1816 LF	\N
761	SEM 48	37814	5652	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0		620	1816 LF	\N
762	SEM 106	37814	5652	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0		620	1816 LF	\N
763	SEM 139	37814	5652	48	1800	VARIOS	BOT-CR-1800 CC- 48 GR - GENERICO VARIOS	CRISTAL	126.0		620	1816 LF	\N
764	SEM 99	22222		17.5	250	VARIOS	BOT-CR-250CC GRANADITA 17,5 SF	CRISTAL	500		680	\N	\N
768	SEM 139	22222		17.5	250	VARIOS	BOT-CR-250CC GRANADITA 17,5 SF	CRISTAL	500		680	\N	\N
771	SEM 48	22222		17.5	250	VARIOS	BOT-CR-250CC GRANADITA 17,5 SF	CRISTAL	500		680	\N	\N
772	SEM 106	22222		17.5	250	VARIOS	BOT-CR-250CC GRANADITA 17,5 SF	CRISTAL	500		680	\N	\N
774	SEM 66	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
775	SEM 99	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
776	SEM 77	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
777	SEM 48	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
778	SEM 106	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
779	SEM 139	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
780	SEM 50	0		42.5	1000	EMPACAR	BOTELLA NUEVA	CRISTAL			600	\N	\N
\.


--
-- Data for Name: cajas_preforma; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.cajas_preforma (id, cod_preforma, num_caja, op, resina, cantidad_inicial, cantidad_actual, fecha_ingreso, fecha_vaciada, estado, observaciones, usuario, created_at, updated_at) FROM stdin;
20	16144-3	2	023T-2026	JADE CZ-328	7000	7000	2026-08-12	\N	activa			2026-08-12 09:07:27	2026-08-12 10:13:15
25	5646-3	1	063TH-2026	JADE CZ 302	7056	10	2026-08-12	\N	faltante			2026-08-12 12:34:54	2026-08-12 12:37:59
26	5646-3	2	063TH-2026	JADE CZ 302	7056	0	2026-08-12	2026-08-12	vaciada			2026-08-12 12:34:54	2026-08-12 12:37:59
27	5646-3	4	063TH-2026	JADE CZ 302	7056	0	2026-08-12	2026-08-12	vaciada			2026-08-12 12:34:54	2026-08-12 12:37:59
28	5646-3	5	063TH-2026	JADE CZ 302	7056	4359	2026-08-12	\N	activa			2026-08-12 12:34:54	2026-08-12 12:37:59
2	11982	32	032B-2026	JADE CZ 302	7000	7000	2026-08-07	\N	activa			2026-08-07 18:47:36	2026-08-12 10:39:17
17	5638	2	033B	JADE	7000	7000	2026-08-08	\N	activa			2026-08-08 11:53:41	2026-08-11 16:26:19
11	5646-3	21	003I-2026	JADE	7000	7000	2026-08-07	\N	activa			2026-08-07 19:58:33	2026-08-11 16:26:20
8	5646-100	NA	032B-2026	NA	7000	7000	2026-08-07	\N	activa			2026-08-07 19:38:04	2026-08-11 16:26:21
19	16144-3	1	023T-2026	JADE CZ-328	7000	4477	2026-08-12	\N	activa			2026-08-12 09:07:27	2026-08-12 10:52:24
22	5638	9	023l-2026	JADE CZ-302	14000	11000	2026-08-12	\N	activa			2026-08-12 11:02:17	2026-08-12 11:02:17
23	5638	10	023I-2026	JADE CZ-302	14000	8992	2026-08-12	\N	activa			2026-08-12 11:02:17	2026-08-12 11:02:17
21	16144-3	10	023T-2026	JADE CZ-328	7000	10	2026-08-12	\N	faltante			2026-08-12 10:35:12	2026-08-12 11:05:31
16	5638	1	033B	JADE	7000	7000	2026-08-08	\N	activa			2026-08-08 11:53:41	2026-08-12 11:09:25
\.


--
-- Data for Name: cajas_preforma_mov; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.cajas_preforma_mov (id, caja_id, reporte_id, cantidad, fecha, created_at, estado, cantidad_irregular, saldo_anterior, descripcion) FROM stdin;
44	21	32	6977	2026-08-12	2026-08-12 10:52:24	faltante	10	7000	
45	21	32	13	2026-08-12	2026-08-12 10:52:24	observado	0	23	rayadas
46	19	32	2523	2026-08-12	2026-08-12 10:52:24	ninguno	0	7000	
47	22	35	3000	2026-08-12	2026-08-12 11:02:17	cambio_caja	3000	14000	
48	23	35	5008	2026-08-12	2026-08-12 11:02:17	ninguno	0	14000	
57	25	37	7034	2026-08-12	2026-08-12 12:37:59	faltante	10	7056	
58	25	37	12	2026-08-12	2026-08-12 12:37:59	observado	0	22	RAYADAS
59	26	37	7056	2026-08-12	2026-08-12 12:37:59	ninguno	0	7056	
60	27	37	7056	2026-08-12	2026-08-12 12:37:59	ninguno	0	7056	
61	28	37	2694	2026-08-12	2026-08-12 12:37:59	ninguno	0	7056	
62	28	37	3	2026-08-12	2026-08-12 12:37:59	observado	0	4362	BURBUJAS
\.


--
-- Data for Name: dig_usuarios; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.dig_usuarios (id, nombre, username, rol, activo, creado_en) FROM stdin;
1	Administrador	admin	administrador	1	2026-03-24T23:59:11.242294
5	elmer	elmer	operador	1	2026-03-25T11:11:57.651560
8	ROBERTO MAMANI	roberto	supervisor	1	2026-04-22T22:30:00.959699
11	ELVIS ROJAS	elvis	operador	1	2026-07-01T14:07:10.277535
12	DANIEL MELENDRES	daniel	operador	1	2026-07-01T14:08:23.021805
13	MARCIAL OLMOS	marcial	operador	1	2026-07-01T14:09:22.021197
14	RENE POMA	rene	operador	1	2026-07-01T14:11:10.317025
15	GABRIEL CAISIRI	gabriel	operador	1	2026-07-01T14:47:14.734476
16	SAMUEL FLORES	samuel	operador	1	2026-07-01T14:48:50.975712
17	GROVER CUTIPA	grover	operador	1	2026-07-01T14:49:25.171150
18	JOSE MAMANI	jose	operador	1	2026-07-01T14:50:07.709118
19	WILBER CASTILLO	wilber	operador	1	2026-07-01T14:51:00.035815
20	ESTEBAN POZO	esteban	operador	1	2026-07-01T14:52:19.284987
22	ALVARO MERCADO	alvaro	operador	1	2026-07-01T14:55:30.270714
23	DAVID ESPINOZA	david	operador	1	2026-07-01T15:01:25.498530
24	BERNARDINO HUANACO	bernardino	operador	1	2026-07-01T15:33:46.709270
25	TOMAS MENDOZA	tomas	operador	1	2026-08-03T12:27:42.621587
26	RAFAEL	rafael	visor	1	2026-08-04T16:48:32.357473
\.


--
-- Data for Name: etiquetas_entries; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.etiquetas_entries (id, orden_op, maquina_id, maquina_nombre, maquina_letra, fecha, turno, cod_botella, cod_preforma, created_at) FROM stdin;
15	088T	2	SEM 106	T	2026-08-12	Tarde	10346	14875-3	2026-08-12 11:34:49
17	088l	8	SEM 63	L	2026-08-12	Dia	7200-3	5646-3	2026-08-12 12:05:23
\.


--
-- Data for Name: machines; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.machines (id, nombre, letra, tipo, activa, orden) FROM stdin;
1	SEM 66	M	ambos	1	4
2	SEM 106	T	ambos	1	8
3	SEM 50	R	ambos	1	2
4	SEM 139	U	ambos	1	9
5	SEM 99	P	ambos	1	7
6	SEM 48	Q	ambos	1	1
7	SEM 77	S	ambos	1	5
8	SEM 63	L	reporte_diario	1	3
9	SEM 78	F	reporte_diario	1	6
10	SEM 63/78		planificacion	1	0
\.


--
-- Data for Name: personal; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.personal (id, nombre, rol, activo) FROM stdin;
2	VICTOR CAMACHO	operador	1
3	CRISTIAN ROJAS	operador	1
4	ROBERTO MAMANI	operador	1
5	GROVER CUTIPA	operador	1
6	GABRIEL CAISIRI	operador	1
7	JOSE L MAMANI	operador	1
8	DANIEL MELENDRES	operador	1
9	MARCIAL OLMOS	operador	1
10	RENE POMA	operador	1
11	BERNARDO HUANACO	operador	1
12	WILBER CASTILLO	operador	1
13	ESTEBAN POZO	operador	1
14	DAVID ESPINOZA	operador	1
15	ALVARO MERCADO	operador	1
16	SAMUEL FLORES	operador	1
17	TOMAS MENDOZA	operador	1
\.


--
-- Data for Name: planes; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.planes (id, semana, maquina, datos, fecha, created_at) FROM stdin;
5	AGOSTO SEMANA 1	SEM 50	{"anio":2026,"botellas":[{"cod":"31306","desc":"BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR","vel":340,"cant":10000},{"cod":"0","desc":"BOTELLA NUEVA","vel":600,"cant":10000},{"cod":"20244-3","desc":"BOT.CR 5.0 LT-93 GR GENERICO","vel":330,"cant":10000}],"mantenimientos":[],"cmHoras":2,"cmInicio":false,"horasPorDia":{"Domingo":{"manana":8,"noche":0},"Lunes":{"manana":8,"noche":0},"Martes":{"manana":8,"noche":0},"Miercoles":{"manana":8,"noche":0},"Jueves":{"manana":8,"noche":0},"Viernes":{"manana":8,"noche":0},"Sabado":{"manana":8,"noche":0}},"resultado":[{"botIdx":0,"bot":{"cod":"31306","desc":"BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR"},"diaIdx":0,"dia":"Domingo","turno":"MANANA","horas":8,"botellas":2720,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"31306","desc":"BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR"},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":8,"botellas":2720,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"31306","desc":"BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":8,"botellas":2720,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"31306","desc":"BOT-CR- 5 LT-SAP:68414057-UNILEVER 93 GR"},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":5.411764705882353,"botellas":1840,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"0","desc":"BOTELLA NUEVA"},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":2,"botellas":0,"cambioMolde":true},{"botIdx":1,"bot":{"cod":"0","desc":"BOTELLA NUEVA"},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":0.5866666666666667,"botellas":352,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"0","desc":"BOTELLA NUEVA"},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"0","desc":"BOTELLA NUEVA"},"diaIdx":5,"dia":"Viernes","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"0","desc":"BOTELLA NUEVA"},"diaIdx":6,"dia":"Sabado","turno":"MANANA","horas":0.08,"botellas":48,"faltante":false,"cambioMolde":false},{"botIdx":2,"bot":{"cod":"20244-3","desc":"BOT.CR 5.0 LT-93 GR GENERICO"},"diaIdx":6,"dia":"Sabado","turno":"MANANA","horas":2,"botellas":0,"cambioMolde":true},{"botIdx":2,"bot":{"cod":"20244-3","desc":"BOT.CR 5.0 LT-93 GR GENERICO"},"diaIdx":6,"dia":"Sabado","turno":"MANANA","horas":5.918181818181818,"botellas":1953,"faltante":false,"cambioMolde":false},{"botIdx":2,"bot":{"cod":"20244-3","desc":"BOT.CR 5.0 LT-93 GR GENERICO"},"diaIdx":-1,"dia":"-","turno":"-","horas":0,"botellas":8047,"faltante":true,"cambioMolde":false}],"diasTotales":[2720,2720,2720,2192,4800,4800,2001],"botellasPorDia":{"0":{"Miercoles":352,"Jueves":4800,"Viernes":4800,"Sabado":48},"31306":{"Domingo":2720,"Lunes":2720,"Martes":2720,"Miercoles":1840},"20244-3":{"Sabado":1953}}}	2026-08-02	2026-08-10 08:44:13
6	AGOSTO SEMANA 1	SEM 77	{"anio":2026,"botellas":[{"cod":"13736-3","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600,"cant":10000,"codPreforma":"6448-3","gramaje":37},{"cod":"14591","desc":"BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A","vel":650,"cant":10000,"codPreforma":"5615-3","gramaje":22},{"cod":"31756","desc":"BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO","vel":650,"cant":10000,"codPreforma":"5847","gramaje":48}],"mantenimientos":[],"cmHoras":1.5,"cmInicio":false,"horasPorDia":{"Domingo":{"manana":8,"noche":0},"Lunes":{"manana":8,"noche":0},"Martes":{"manana":8,"noche":0},"Miercoles":{"manana":8,"noche":0},"Jueves":{"manana":8,"noche":0},"Viernes":{"manana":8,"noche":0},"Sabado":{"manana":8,"noche":0}},"resultado":[{"botIdx":0,"bot":{"cod":"13736-3","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":0,"dia":"Domingo","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"13736-3","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"13736-3","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":0.6666666666666666,"botellas":400,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"14591","desc":"BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":1.5,"botellas":0,"cambioMolde":true},{"botIdx":1,"bot":{"cod":"14591","desc":"BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":5.832307692307692,"botellas":3791,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"14591","desc":"BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A"},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":8,"botellas":5200,"faltante":false,"cambioMolde":false},{"botIdx":1,"bot":{"cod":"14591","desc":"BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A"},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":1.5523076923076924,"botellas":1009,"faltante":false,"cambioMolde":false},{"botIdx":2,"bot":{"cod":"31756","desc":"BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO"},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":1.5,"botellas":0,"cambioMolde":true},{"botIdx":2,"bot":{"cod":"31756","desc":"BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO"},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":4.946153846153846,"botellas":3215,"faltante":false,"cambioMolde":false},{"botIdx":2,"bot":{"cod":"31756","desc":"BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO"},"diaIdx":5,"dia":"Viernes","turno":"MANANA","horas":8,"botellas":5200,"faltante":false,"cambioMolde":false},{"botIdx":2,"bot":{"cod":"31756","desc":"BOT-BL-0.9 LT-SAP:68482910- 48 GR BLANCO"},"diaIdx":6,"dia":"Sabado","turno":"MANANA","horas":2.4384615384615387,"botellas":1585,"faltante":false,"cambioMolde":false}],"diasTotales":[4800,4800,4191,5200,4224,5200,1585],"botellasPorDia":{"14591":{"Martes":3791,"Miercoles":5200,"Jueves":1009},"31756":{"Jueves":3215,"Viernes":5200,"Sabado":1585},"13736-3":{"Domingo":4800,"Lunes":4800,"Martes":400}}}	2026-08-02	2026-08-10 09:14:59
8	AGOSTO SEMANA 1	SEM 139	{"anio":2026,"botellas":[{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100","vel":670,"cant":17000,"codPreforma":"","gramaje":20.6}],"mantenimientos":[],"cmHoras":2,"cmInicio":false,"horasPorDia":{"Domingo":{"manana":0,"noche":7},"Lunes":{"manana":0,"noche":7},"Martes":{"manana":8,"noche":7},"Miercoles":{"manana":8,"noche":0},"Jueves":{"manana":8,"noche":0},"Viernes":{"manana":8,"noche":0},"Sabado":{"manana":8,"noche":0}},"resultado":[{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100"},"diaIdx":0,"dia":"Domingo","turno":"NOCHE","horas":7,"botellas":4690,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100"},"diaIdx":1,"dia":"Lunes","turno":"NOCHE","horas":7,"botellas":4690,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":8,"botellas":5360,"faltante":false,"cambioMolde":false},{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100"},"diaIdx":2,"dia":"Martes","turno":"NOCHE","horas":3.373134328358209,"botellas":2260,"faltante":false,"cambioMolde":false}],"diasTotales":[4690,4690,7620,0,0,0,0],"botellasPorDia":{"111111":{"Domingo":4690,"Lunes":4690,"Martes":7620}}}		2026-08-10 10:16:25
11	AGOSTO SEMANA 3	SEM 77	{"anio":2026,"botellas":[{"id":1,"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100","vel":670,"cant":10000,"codPreforma":"","gramaje":20.6},{"id":2,"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600,"cant":10000,"codPreforma":"6448-100","gramaje":37}],"mantenimientos":[],"cmHoras":2,"cmInicio":false,"cmOverrides":{},"horasPorDia":{"Domingo":{"manana":8,"noche":0},"Lunes":{"manana":8,"noche":0},"Martes":{"manana":8,"noche":0},"Miercoles":{"manana":8,"noche":0},"Jueves":{"manana":8,"noche":0},"Viernes":{"manana":8,"noche":0},"Sabado":{"manana":8,"noche":0}},"resultado":[{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100","vel":670},"diaIdx":0,"dia":"Domingo","turno":"MANANA","horas":8,"botellas":5360,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-15:30"},{"botIdx":0,"bot":{"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100","vel":670},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":6.925373134328358,"botellas":4640,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-14:26"},{"id":2,"botIdx":1,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":1.0746268656716422,"botellas":0,"cambioMolde":true,"horaTexto":"14:26-15:30"},{"id":2,"botIdx":1,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":0.9253731343283578,"botellas":0,"cambioMolde":true,"horaTexto":"07:30-08:26"},{"botIdx":1,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":7.073333333333333,"botellas":4244,"faltante":false,"cambioMolde":false,"horaTexto":"08:26-15:30"},{"botIdx":1,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-15:30"},{"botIdx":1,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":1.5933333333333333,"botellas":956,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-09:06"}],"diasTotales":[5360,4640,4244,4800,956,0,0],"botellasPorDia":{"111111":{"Domingo":5360,"Lunes":4640},"13736-100":{"Martes":4244,"Miercoles":4800,"Jueves":956}}}	2026-08-09	2026-08-10 12:18:35
10	AGOSTO SEMANA 1	SEM 99	{"anio":2026,"botellas":[{"id":1,"cod":"10346","desc":"BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL","vel":670,"cant":10000,"codPreforma":"14875-3","gramaje":20.6},{"id":2,"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600,"cant":10000,"codPreforma":"6448","gramaje":37},{"id":3,"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":620,"cant":10000,"codPreforma":"6448-100","gramaje":37}],"mantenimientos":[],"cmHoras":2,"cmInicio":false,"cmOverrides":{},"horasPorDia":{"Domingo":{"manana":0,"noche":7},"Lunes":{"manana":8,"noche":7},"Martes":{"manana":8,"noche":0},"Miercoles":{"manana":8,"noche":0},"Jueves":{"manana":8,"noche":0},"Viernes":{"manana":8,"noche":0},"Sabado":{"manana":8,"noche":0}},"resultado":[{"botIdx":0,"bot":{"cod":"10346","desc":"BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL","vel":670},"diaIdx":0,"dia":"Domingo","turno":"NOCHE","horas":7,"botellas":4690,"faltante":false,"cambioMolde":false,"horaTexto":"23:30-06:30+1"},{"botIdx":0,"bot":{"cod":"10346","desc":"BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL","vel":670},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":7.925373134328358,"botellas":5310,"faltante":false,"cambioMolde":false,"horaTexto":"06:30-14:26"},{"id":2,"botIdx":1,"bot":{"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":1,"dia":"Lunes","turno":"MANANA","horas":0.07462686567164223,"botellas":0,"cambioMolde":true,"horaTexto":"14:26-14:30"},{"id":2,"botIdx":1,"bot":{"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":1,"dia":"Lunes","turno":"NOCHE","horas":1.9253731343283578,"botellas":0,"cambioMolde":true,"horaTexto":"23:30-01:26+1"},{"botIdx":1,"bot":{"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":1,"dia":"Lunes","turno":"NOCHE","horas":5.073333333333333,"botellas":3044,"faltante":false,"cambioMolde":false,"horaTexto":"01:26-06:30+1"},{"botIdx":1,"bot":{"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":2,"dia":"Martes","turno":"MANANA","horas":8,"botellas":4800,"faltante":false,"cambioMolde":false,"horaTexto":"06:30-14:30"},{"botIdx":1,"bot":{"cod":"13736","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":3.5933333333333333,"botellas":2156,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-11:06"},{"id":3,"botIdx":2,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A"},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":2,"botellas":0,"cambioMolde":true,"horaTexto":"11:06-13:06"},{"botIdx":2,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":620},"diaIdx":3,"dia":"Miercoles","turno":"MANANA","horas":2.4064516129032256,"botellas":1492,"faltante":false,"cambioMolde":false,"horaTexto":"13:06-15:30"},{"botIdx":2,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":620},"diaIdx":4,"dia":"Jueves","turno":"MANANA","horas":8,"botellas":4960,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-15:30"},{"botIdx":2,"bot":{"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":620},"diaIdx":5,"dia":"Viernes","turno":"MANANA","horas":5.72258064516129,"botellas":3548,"faltante":false,"cambioMolde":false,"horaTexto":"07:30-13:13"}],"diasTotales":[4690,8354,4800,3648,4960,3548,0],"botellasPorDia":{"10346":{"Domingo":4690,"Lunes":5310},"13736":{"Lunes":3044,"Martes":4800,"Miercoles":2156},"13736-100":{"Miercoles":1492,"Jueves":4960,"Viernes":3548}}}	2026-08-09	2026-08-10 11:22:01
\.


--
-- Data for Name: planificacion_adiciones; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.planificacion_adiciones (id, semana, maquina, cod_bot, descripcion, cantidad, vel, despues_de, notas, submaq, created_at) FROM stdin;
\.


--
-- Data for Name: planificacion_historial; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.planificacion_historial (id, semana, maquina, datos, created_at) FROM stdin;
2	AGOSTO SEMANA 3	SEM 77	{"timestamp":"2026-08-10T18:17:00.541Z","paros":[],"adiciones":[],"grupos":[{"label":"SEM 77","botellas":[{"id":1,"cod":"111111","desc":"BOT-CR-500 GARRAFITA 20,6G-100","vel":670,"total":10000,"producidoAcumulado":0,"restante":10000,"desfaseDias":-3.8,"diasPasado":[{"dia":"Domingo","diaIdx":0,"planOriginal":5360,"real":0}],"diasFuturo":[{"dia":"Lunes","diaIdx":1,"cantidad":5360},{"dia":"Martes","diaIdx":2,"cantidad":4640},{"dia":"Miercoles","diaIdx":3,"cantidad":0},{"dia":"Jueves","diaIdx":4,"cantidad":0},{"dia":"Viernes","diaIdx":5,"cantidad":0},{"dia":"Sabado","diaIdx":6,"cantidad":0}],"esAdicion":false},{"id":2,"cod":"13736-100","desc":"BOT-CR-1.500 CC-37-GR-ESTRIADA-BEBIDAS S.A","vel":600,"total":10000,"producidoAcumulado":0,"restante":10000,"desfaseDias":0,"diasPasado":[{"dia":"Domingo","diaIdx":0,"planOriginal":0,"real":0}],"diasFuturo":[{"dia":"Lunes","diaIdx":1,"cantidad":0},{"dia":"Martes","diaIdx":2,"cantidad":0},{"dia":"Miercoles","diaIdx":3,"cantidad":4244},{"dia":"Jueves","diaIdx":4,"cantidad":4800},{"dia":"Viernes","diaIdx":5,"cantidad":956},{"dia":"Sabado","diaIdx":6,"cantidad":0}],"esAdicion":false}],"noProducibles":[]}]}	2026-08-10 14:17:00
\.


--
-- Data for Name: planificacion_paros; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.planificacion_paros (id, semana, maquina, dia_idx, dia_nombre, horas, motivo, created_at) FROM stdin;
\.


--
-- Data for Name: planificacion_reasignaciones; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.planificacion_reasignaciones (id, semana, maq_origen, maq_destino, cod_bot, descripcion, cantidad, vel, motivo, created_at) FROM stdin;
\.


--
-- Data for Name: preformas; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.preformas (id, codigo, descripcion, unid_caja, gramaje) FROM stdin;
1	14885-3	PREFORMA SF 54.6 GR CRISTAL SHORT FINISH	7056	54.6
2	5652-3	PREFORMA PET 48 GRAMOS CRISTAL	7000	48
3	5652	PREFORMA PET 48 GRAMOS CRISTAL	7000	48
4	5646-100	PREFORMA PET 56 GRAMOS CRISTAL	7000	56
5	5652-100	PREFORMA PET 48 GRAMOS CRISTAL	7000	48
6	14876-3	PREFORMA SF 23.1 GR CRISTAL SHORT FINISH	15120	23.1
7	6448-3	PREFORMA PET 37 GRAMOS CRISTAL	8400	37
8	6448-100	PREFORMA PET 37 GRAMOS CRISTAL	8400	37
9	16144-3	PREFORMA PET 93 GRAMOS CRISTAL	3000	93
10	5615-100	PREFORMA PET 22 GRAMOS CRISTAL	14000	22
11	5615-3	PREFORMA PET 22 GRAMOS CRISTAL	14000	22
12	5847	PREFORMA PET 48 GRAMOS BLANCO	7000	48
13	14877-3	PREFORMA SF 46.6 GR CRISTAL SHORT FINISH	7056	46.6
14	5638-3	PREFORMA PET 52 GRAMOS CRISTAL	7000	52
15	23289-3	PREFORMA SF 52.65 GR CRISTAL-SHORT FINISH CAJA CARTON	7056	52.65
16	34859-100	PREFORMA PET 31.5 GR CRISTAL SHORT FINISH	9072	31.5
17	34859-3	PREFORMA PET 31.5 GR CRISTAL SHORT FINISH	9072	31.5
18	5646-3	PREFORMA PET 56 GRAMOS CRISTAL	7000	56
19	11982-3	PREFORMA PET 17.5 GRAMOS CRISTAL	16800	17.5
20	28618-3	PREFORMA PET 17.5 GR SHORT FINISH CRISTAL	17360	17.5
21	5631-3	PREFORMA PET 28 GRAMOS CRISTAL	14000	28
22	25100-3	PREFORMA SF 56.7 GRS CRISTAL	7056	56.7
23	5625-3	PREFORMA PET 24.5 GRAMOS CRISTAL	14000	24.5
24	14875-3	PREFORMA SF 20.6 GR CRISTAL SHORT FINISH	15120	20.6
25	5659-3	PREFORMA PET 48 GRAMOS VERDE	7000	48
26	5621-3	PREFORMA PET 22 GRAMOS VERDE 30% ECOPET	14000	22
27	34103-3	PREFORMA PET 48 GRAMOS NEGRO	7000	48
28	14876-100	PREFORMA SF 23.1 GR CRISTAL SHORT FINISH	15120	23.1
29	12481-3	PREFORMA PET 17.5 GRAMOS VERDE	16800	17.5
30	8235-3	PREFORMA PET 60 GRAMOS CRISTAL	7000	60
31	26041-3	PREFORMA PET DE 42.5 GR CRISTAL	8120	42.5
32	26041	PREFORMA PET DE 42.5 GR CRISTAL	8120	42.5
33	23502	PREFORMA PET 93 GR LILA PLENO 30% ECOPET	3000	\N
34	21108	PREFORMA PET 93 GRAMOS BLANCO	3000	93
35	28618	PREFORMA PET 17.5 GR SHORT FINISH CRISTAL	17360	17.5
36	22104	PREFORMA PET 93 GR AZUL PLENO 30% ECOPET	3000	93
37	23500	PREFORMA PET 93 GR FUSCIA PLENO 30% ECOPET	3000	\N
38	5638	PREFORMA PET 52 GRAMOS CRISTAL	7000	52
39	14877	PREFORMA SF 46.6 GR CRISTAL SHORT FINISH	7056	46.6
40	5646	PREFORMA PET 56 GRAMOS CRISTAL	7000	56
41	16144	PREFORMA PET 93 GRAMOS CRISTAL	3000	93
42	11982	PREFORMA PET 17.5 GRAMOS CRISTAL	16800	17.5
43	21006	PREFORMA PET 52.8 GRAMOS BLANCO	7000	52.8
44	16118	PREFORMA PET 80 GRAMOS CRISTAL	4000	80
45	29982-3	PREFORMA PET 17.5 GRAMOS NEGRO	16800	17.5
46	16174-3	PREFORMA PET 86 GRAMOS CRISTAL 30%	3000	86
47	5629-3	PREFORMA PET 24.5 GRAMOS VERDE	14000	24.5
48	35330-3	PREFORMA PET 31.5 GR VERDE SHORT FINISH	9072	31.5
49	23693-3	PREFORMA SF 20.6 GR VERDE SHORT FINISH	15120	20.6
50	6448	PREFORMA PET 37 GRAMOS CRISTAL	8400	37
51	5625	PREFORMA PET 24.5 GRAMOS CRISTAL	14000	24.5
52	8235-N-DE	PREFORMA PET 60 GRAMOS CRITAL	7000	60
53	6794-3	PREFORMA PET 37 GRAMOS VERDE	8400	37
54	12373-3	PREFORMA PET 17.5 GRAMOS AMBAR	16800	17.5
55	29498	PREFORMA PET 22 GRAMOS BLANCO	14000	22
56	8234-3	PREFORMA PET 58 GRAMOS CRISTAL	7000	58
57	14876	PREFORMA SF 23.1 GR CRISTAL SHORT FINISH	15120	23.1
58	14875-100	Preformas 20.66G ECOPET	15120	20.66
\.


--
-- Data for Name: reportes_diarios; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.reportes_diarios (id, orden_op, fecha, turno, operador, ayudante, maquina, cod_botella, bot_buenas, merma_bot, merma_pref, num_bolsas, hora_inicio, hora_fin, minutos_disponibles, paradas_programadas, paradas_no_programadas, tiempo_cambio_molde, created_at, etiq_ini, etiq_fin, cant_por_bolsa, merma_total, total_produccion, defectos_preforma, fin_produccion_saldo, fin_produccion_pedido_especial, saldo_generado, cantidad_extra_pedido_especial, cm_ini, cm_fin, estado_validacion, validado_por, validado_en, rechazado_por, rechazado_en, motivo_rechazo, observaciones) FROM stdin;
32	023r	2026-08-12	Mañana	TOMAS MENDOZA		SEM 50	31306	9500	0	0	19	10:00	18:00	480	[{"detalle":"proceso","horaInicio":"10:40","horaFin":"10:50","minutos":10}]	[{"detalle":"cambio de cilindro roto","horaInicio":"12:00","horaFin":"13:00","minutos":60}]	40	2026-08-12 10:35:12	1	19	500	0	9500	[]	0	0	0	0	10:00	10:40	validado	Administrador	2026-08-12 14:35				se producjo con preforma observada
35	088	2026-08-12	Tarde	VICTOR CAMACHO		SEM 106	7563	7973	12	23	67	10:00	18:00	480	[]	[]	0	2026-08-12 11:02:17	1	67	119	35	8008	[]	0	0	0	0			validado	Administrador	2026-08-12 15:02				PREFORMA REMOVIDA
37	088l	2026-08-12	Tarde	MARCIAL OLMOS	RENE POMA, SAMUEL FLORES	SEM 63	7200-3	23840	0	0	298	13:00	20:00	420	[]	[]	0	2026-08-12 12:34:53	2	299	80	0	23840	[]	0	0	0	0			validado	Administrador	2026-08-12 16:37				
\.


--
-- Data for Name: saldo_botellas; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.saldo_botellas (id, cod_botella, maquina, cantidad_actual, estado, fecha, observaciones, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: saldo_botellas_mov; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.saldo_botellas_mov (id, saldo_id, reporte_id, tipo, cantidad, fecha, created_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.sessions (token, user_id, created_at, expires_at) FROM stdin;
bd80da5b-c0d0-468a-ad6d-c00c3d0b171a	1	2026-08-08 09:35:40	2026-08-09T01:35:40.808Z
a96566b9-bd80-4fa8-8ef8-78a6835a4aee	1	2026-08-08 09:35:52	2026-08-09T01:35:52.352Z
65cc8361-cb6a-4419-b4c4-a5d0ed16527c	1	2026-08-08 09:36:41	2026-08-09T01:36:41.384Z
03edc4da-4422-4f77-984d-d26b3fb42f95	1	2026-08-08 09:37:11	2026-08-09T01:37:11.513Z
0b4eb7b3-8d11-4545-902f-07e3d669102b	1	2026-08-08 09:37:28	2026-08-09T01:37:28.974Z
8278bc78-0a08-4ac4-aaac-eabc4018bedb	1	2026-08-08 09:39:15	2026-08-09T01:39:15.212Z
bfdedc0d-ddc3-43e2-883e-32c9fc8d67d1	1	2026-08-08 09:40:31	2026-08-09T01:40:31.229Z
0f280db6-4d57-41bf-911c-515b8048f980	1	2026-08-08 09:41:42	2026-08-09T01:41:42.156Z
57f9a22a-dd33-4552-a218-c49203800066	1	2026-08-08 09:45:16	2026-08-09T01:45:16.389Z
05ade49a-0f3e-4cfb-8e13-7baaf2527405	1	2026-08-08 10:14:43	2026-08-09T02:14:43.047Z
89522a8f-b1bc-4cfd-9c6f-04828f5ef2f5	1	2026-08-08 10:19:34	2026-08-09T02:19:34.414Z
3857f3bd-5587-47e0-b70a-e728c65fa885	1	2026-08-08 10:41:11	2026-08-09T02:41:11.391Z
8b3bf53e-4a99-476d-99f2-93e0d9ef52bc	1	2026-08-08 10:47:47	2026-08-09T02:47:47.702Z
f2220c4d-a40f-4705-9294-fef0757af3b7	1	2026-08-08 10:47:58	2026-08-09T02:47:58.965Z
7b0c297e-9eee-4e18-bce8-2a6f5f2feaf6	1	2026-08-08 10:48:15	2026-08-09T02:48:15.377Z
1b69f5a5-2daf-443f-a0dc-8407a6cff906	1	2026-08-08 10:54:53	2026-08-09T02:54:53.068Z
2b1ea04c-4557-4b49-89dc-22770e0d9451	1	2026-08-08 11:29:46	2026-08-09T03:29:46.967Z
a83d01a8-a14b-4202-9444-9bf984a9b7e6	1	2026-08-08 11:29:56	2026-08-09T03:29:56.011Z
ef2b6aac-b8e6-4008-8da0-c61cc5de8f5d	1	2026-08-08 11:30:10	2026-08-09T03:30:10.546Z
acf5184b-5af0-4a1e-8540-55cf73697500	1	2026-08-08 11:47:16	2026-08-09T03:47:16.798Z
d90b1e59-0106-48ca-b05f-cea885a75cc4	1	2026-08-08 11:47:51	2026-08-09T03:47:51.817Z
31ddf0a3-2fce-4346-a3fc-703671b652cd	1	2026-08-08 12:19:24	2026-08-09T04:19:24.825Z
ee6565eb-77e3-4832-bee8-b5211865c1f3	1	2026-08-08 12:19:39	2026-08-09T04:19:39.975Z
da58f30d-1292-492b-9bc0-e49d31c86d32	1	2026-08-08 12:19:58	2026-08-09T04:19:58.267Z
000ead7b-92ed-4500-b9ca-ecc5665ef2b1	1	2026-08-08 12:34:15	2026-08-09T04:34:15.060Z
d21ee016-f0c8-4a7d-a904-dbdc53b12e7c	1	2026-08-08 13:05:08	2026-08-09T05:05:08.096Z
7d465a53-93c1-44f4-ace5-1097d6c32947	1	2026-08-10 08:41:59	2026-08-11T00:41:59.314Z
5fe1a1fc-561e-4ed9-ae2e-60001c460664	1	2026-08-10 08:42:42	2026-08-11T00:42:42.467Z
74554232-16d3-4dc0-a349-85b56de52ce0	1	2026-08-10 08:42:49	2026-08-11T00:42:49.074Z
e03e50a6-3307-4143-ba46-293c8bb9d1a5	1	2026-08-10 09:16:50	2026-08-11T01:16:50.211Z
cbf834c0-83ff-445d-a130-a9e56ad1cc94	1	2026-08-10 09:17:01	2026-08-11T01:17:01.844Z
4b3f6f39-3267-40d0-a0ed-b3010ad61fe0	1	2026-08-10 09:17:15	2026-08-11T01:17:15.779Z
e89dc9e9-4b03-416c-9e19-b069cb5a4ccb	1	2026-08-10 10:27:32	2026-08-11T02:27:32.909Z
c23eae98-f459-4974-8bfa-53891a49078a	1	2026-08-10 10:51:56	2026-08-11T02:51:56.362Z
537ca944-ca81-44e3-a89f-742fb61559ba	1	2026-08-10 10:55:52	2026-08-11T02:55:52.954Z
82d5121d-7763-486b-aced-bde8046c3ba8	1	2026-08-10 11:35:10	2026-08-11T03:35:10.932Z
488bc213-4df5-4b3d-bcd5-f898a0ec7344	1	2026-08-10 11:35:54	2026-08-11T03:35:54.397Z
1e2e589f-1b45-4ee7-916e-0229aca658da	1	2026-08-10 11:37:19	2026-08-11T03:37:19.040Z
d612a29e-7498-4a0f-a6c0-52945a1d82ab	1	2026-08-10 11:55:26	2026-08-11T03:55:26.443Z
8a768b84-bb5b-4511-bd4d-7b329f4a8ab0	1	2026-08-10 12:06:47	2026-08-11T04:06:47.401Z
07abc95f-5d11-4df6-b68c-6d7d6bcee7c9	1	2026-08-10 13:27:07	2026-08-11T05:27:07.030Z
beefbc43-4fa5-4ce8-be4a-a66e35940c17	1	2026-08-10 13:27:40	2026-08-11T05:27:40.911Z
71769843-1b75-436c-86e9-7cc07f45a966	1	2026-08-10 13:28:01	2026-08-11T05:28:01.883Z
8b91d986-6e92-4fa1-b99d-ef0398554b28	1	2026-08-10 13:28:53	2026-08-11T05:28:53.643Z
1b7fce54-5fe9-40be-97df-b4d75185dab8	1	2026-08-10 14:10:17	2026-08-11T06:10:17.397Z
82c7476d-9951-4012-b388-9305387d2a48	1	2026-08-10 14:10:38	2026-08-11T06:10:38.740Z
565cc227-2dee-49d0-90bf-dc3aa21debdf	1	2026-08-10 14:35:29	2026-08-11T06:35:29.766Z
2551e86b-07ff-45dd-8c52-edd6dacf20e2	1	2026-08-10 14:38:16	2026-08-11T06:38:16.967Z
ee90379b-9625-4750-aa1a-a5e95aa75f01	1	2026-08-10 14:58:13	2026-08-11T06:58:13.858Z
16658b1b-c1ec-4bda-b3c8-ac8813daa49f	1	2026-08-10 15:07:07	2026-08-11T07:07:07.735Z
effb0e16-7785-442e-942b-325fa0142cb2	1	2026-08-10 15:26:07	2026-08-11T07:26:07.016Z
6e6efdcb-ecc6-4c7e-a0e4-f94c5b2ecafe	1	2026-08-10 15:27:00	2026-08-11T07:27:00.459Z
23490f0e-551b-4cfa-94b5-2d3ef5b117b8	1	2026-08-10 15:38:00	2026-08-11T07:38:00.700Z
ce170064-1c77-465c-9ad9-2d9c234624b3	1	2026-08-10 16:08:30	2026-08-11T08:08:30.602Z
27125634-d936-40ef-a836-d791539a4aef	1	2026-08-10 16:15:51	2026-08-11T08:15:51.123Z
853d4598-2c48-40d5-9451-a2d48cee0636	1	2026-08-10 16:16:50	2026-08-11T08:16:50.629Z
9204e120-1c46-4e86-bca1-4e721d4078e2	1	2026-08-11 08:29:40	2026-08-12T00:29:40.745Z
709ef57d-9dd2-4054-aa73-b3db68a0f840	1	2026-08-11 11:25:10	2026-08-12T03:25:10.413Z
550a6790-51ea-4144-a15c-0ae87b7e81d8	1	2026-08-11 11:28:20	2026-08-12T03:28:20.857Z
b00ff0cb-b374-4fe9-a31a-aa841d40ade5	1	2026-08-11 11:28:30	2026-08-12T03:28:30.806Z
8b6c3e38-acf6-4b0a-a65f-a191ae1cc19e	1	2026-08-11 11:44:27	2026-08-12T03:44:27.814Z
2e6d4dbd-7845-487f-88bc-0b9d7b1fad41	1	2026-08-11 11:44:40	2026-08-12T03:44:40.771Z
2ebadb61-2919-400e-8485-365e5dbb2008	1	2026-08-11 11:45:19	2026-08-12T03:45:19.696Z
a38186f3-4de7-48cf-8755-698af05d90ad	1	2026-08-11 11:46:40	2026-08-12T03:46:40.236Z
88e3f517-0eba-45fd-bf1d-d556ec1eb45d	1	2026-08-11 12:00:08	2026-08-12T04:00:08.804Z
da9a32d0-ff3f-4706-a546-715ee92f1dc5	1	2026-08-11 12:08:59	2026-08-12T04:08:59.232Z
dc451f51-2baf-4948-8fc2-4a1c7db84109	1	2026-08-11 12:11:59	2026-08-12T04:11:59.456Z
665c4b60-ff82-4c97-afbd-0953a7d12e16	1	2026-08-11 12:16:50	2026-08-12T04:16:50.205Z
1d956568-82b8-4e36-b29b-881661564080	1	2026-08-11 12:35:10	2026-08-12T04:35:10.294Z
40e79e00-6681-4135-aa83-ff51312fe974	1	2026-08-11 14:10:27	2026-08-12T06:10:27.269Z
d90275f6-2557-40a1-9bed-01fab62371ea	1	2026-08-11 14:30:13	2026-08-12T06:30:13.297Z
dd42c04c-32cd-4f06-844a-7fe16c944e38	1	2026-08-11 14:41:34	2026-08-12T06:41:34.430Z
c27f5d0a-e1a4-4bef-a482-c70ae5b1d9c2	1	2026-08-11 14:45:23	2026-08-12T06:45:23.142Z
70f508a9-0fbd-4c39-8279-f56623a66eb9	1	2026-08-11 14:50:25	2026-08-12T06:50:25.187Z
94460a43-a749-4738-b4f3-cf050a737d12	1	2026-08-11 14:56:10	2026-08-12T06:56:10.101Z
e9df452f-c627-421c-aca8-434f68c99ec0	1	2026-08-11 15:00:23	2026-08-12T07:00:23.643Z
6d983302-e11c-4d70-b8de-c810b8913690	1	2026-08-11 15:04:52	2026-08-12T07:04:52.795Z
5b30c639-18e7-4267-a91d-6fa55ee8cf57	1	2026-08-11 15:11:10	2026-08-12T07:11:10.989Z
385a4fbe-8c03-4cb6-ad76-ce806d77784d	1	2026-08-11 15:16:43	2026-08-12T07:16:43.200Z
6acd7a9a-ac7d-4235-b2c1-c0f4a78b8b81	1	2026-08-11 15:23:23	2026-08-12T07:23:23.303Z
185f7153-13f0-48c0-8589-599472c15107	1	2026-08-11 15:34:38	2026-08-12T07:34:38.681Z
fe235e18-b35f-48af-900f-d9fb4a13ffc4	1	2026-08-11 16:18:20	2026-08-12T08:18:20.689Z
4c9aac9d-a53a-4af5-8626-ebf7ddfc8a52	1	2026-08-11 16:18:45	2026-08-12T08:18:45.861Z
9931b523-04ec-465b-88d8-d06e502fdee7	1	2026-08-11 16:19:02	2026-08-12T08:19:02.266Z
1ddf68ff-1532-40d7-9c30-1cc428cd0b76	1	2026-08-11 16:19:15	2026-08-12T08:19:15.247Z
4ac1e10f-dcb4-4f5a-8970-68f82b275e38	1	2026-08-11 16:19:45	2026-08-12T08:19:45.678Z
cbf61cb6-05a5-4e9f-b6fa-4bdc6d3c9617	1	2026-08-11 16:20:04	2026-08-12T08:20:04.014Z
639e93e8-5ca8-41dc-8a14-d66b50956658	1	2026-08-12 07:16:48	2026-08-12T23:16:48.270Z
b3e833d4-2361-4271-9765-6724757246f5	1	2026-08-12 07:17:07	2026-08-12T23:17:07.376Z
2757cfad-53cc-4a8f-821f-423b4f396f40	1	2026-08-12 07:30:38	2026-08-12T23:30:38.179Z
90cb45ad-cda2-49c9-baca-f12f3eae3537	1	2026-08-12 10:07:28	2026-08-13T02:07:28.926Z
c54900b7-4de4-482d-a08b-d0bb0bf4fbbb	1	2026-08-12 11:55:29	2026-08-13T03:55:29.826Z
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: etiquetas2_app
--

COPY public.users (id, username, display_name, password_hash, password_salt, role, created_at) FROM stdin;
1	admin	Administrador	db64ae85b46bfd7cbfa89a3cc4d893208d2ffd213bb5fd2cac40456a6cd748752f008509ad821ce300deaaaf4376ccc2740cc260f3e1b7dff0fdf4837faf1d46	264c1393d0eb9aeb7f490b3170c96b17	admin	2026-08-07 15:14:34
\.


--
-- Name: cajas_preforma_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.cajas_preforma_id_seq', 28, true);


--
-- Name: cajas_preforma_mov_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.cajas_preforma_mov_id_seq', 62, true);


--
-- Name: etiquetas_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.etiquetas_entries_id_seq', 17, true);


--
-- Name: machines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.machines_id_seq', 11, true);


--
-- Name: personal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.personal_id_seq', 17, true);


--
-- Name: planes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.planes_id_seq', 13, true);


--
-- Name: planificacion_adiciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.planificacion_adiciones_id_seq', 1, true);


--
-- Name: planificacion_historial_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.planificacion_historial_id_seq', 2, true);


--
-- Name: planificacion_paros_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.planificacion_paros_id_seq', 2, true);


--
-- Name: planificacion_reasignaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.planificacion_reasignaciones_id_seq', 1, true);


--
-- Name: reportes_diarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.reportes_diarios_id_seq', 37, true);


--
-- Name: saldo_botellas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.saldo_botellas_id_seq', 1, true);


--
-- Name: saldo_botellas_mov_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.saldo_botellas_mov_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: etiquetas2_app
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: botellas botellas_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.botellas
    ADD CONSTRAINT botellas_pkey PRIMARY KEY (id);


--
-- Name: cajas_preforma_mov cajas_preforma_mov_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.cajas_preforma_mov
    ADD CONSTRAINT cajas_preforma_mov_pkey PRIMARY KEY (id);


--
-- Name: cajas_preforma cajas_preforma_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.cajas_preforma
    ADD CONSTRAINT cajas_preforma_pkey PRIMARY KEY (id);


--
-- Name: dig_usuarios dig_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.dig_usuarios
    ADD CONSTRAINT dig_usuarios_pkey PRIMARY KEY (id);


--
-- Name: dig_usuarios dig_usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.dig_usuarios
    ADD CONSTRAINT dig_usuarios_username_key UNIQUE (username);


--
-- Name: etiquetas_entries etiquetas_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.etiquetas_entries
    ADD CONSTRAINT etiquetas_entries_pkey PRIMARY KEY (id);


--
-- Name: machines machines_nombre_key; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_nombre_key UNIQUE (nombre);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: personal personal_nombre_key; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.personal
    ADD CONSTRAINT personal_nombre_key UNIQUE (nombre);


--
-- Name: personal personal_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.personal
    ADD CONSTRAINT personal_pkey PRIMARY KEY (id);


--
-- Name: planes planes_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planes
    ADD CONSTRAINT planes_pkey PRIMARY KEY (id);


--
-- Name: planificacion_adiciones planificacion_adiciones_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_adiciones
    ADD CONSTRAINT planificacion_adiciones_pkey PRIMARY KEY (id);


--
-- Name: planificacion_historial planificacion_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_historial
    ADD CONSTRAINT planificacion_historial_pkey PRIMARY KEY (id);


--
-- Name: planificacion_paros planificacion_paros_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_paros
    ADD CONSTRAINT planificacion_paros_pkey PRIMARY KEY (id);


--
-- Name: planificacion_reasignaciones planificacion_reasignaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.planificacion_reasignaciones
    ADD CONSTRAINT planificacion_reasignaciones_pkey PRIMARY KEY (id);


--
-- Name: preformas preformas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.preformas
    ADD CONSTRAINT preformas_codigo_key UNIQUE (codigo);


--
-- Name: preformas preformas_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.preformas
    ADD CONSTRAINT preformas_pkey PRIMARY KEY (id);


--
-- Name: reportes_diarios reportes_diarios_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.reportes_diarios
    ADD CONSTRAINT reportes_diarios_pkey PRIMARY KEY (id);


--
-- Name: saldo_botellas_mov saldo_botellas_mov_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.saldo_botellas_mov
    ADD CONSTRAINT saldo_botellas_mov_pkey PRIMARY KEY (id);


--
-- Name: saldo_botellas saldo_botellas_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.saldo_botellas
    ADD CONSTRAINT saldo_botellas_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_botellas_cod_bot; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_botellas_cod_bot ON public.botellas USING btree (cod_bot);


--
-- Name: idx_botellas_maquina; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_botellas_maquina ON public.botellas USING btree (maquina);


--
-- Name: idx_cajas_mov_caja; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_cajas_mov_caja ON public.cajas_preforma_mov USING btree (caja_id);


--
-- Name: idx_cajas_mov_reporte; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_cajas_mov_reporte ON public.cajas_preforma_mov USING btree (reporte_id);


--
-- Name: idx_cajas_pref_cod; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_cajas_pref_cod ON public.cajas_preforma USING btree (cod_preforma);


--
-- Name: idx_cajas_pref_estado; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_cajas_pref_estado ON public.cajas_preforma USING btree (estado);


--
-- Name: idx_saldo_bot_cod; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_saldo_bot_cod ON public.saldo_botellas USING btree (cod_botella);


--
-- Name: idx_saldo_bot_estado; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_saldo_bot_estado ON public.saldo_botellas USING btree (estado);


--
-- Name: idx_saldo_mov_reporte; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_saldo_mov_reporte ON public.saldo_botellas_mov USING btree (reporte_id);


--
-- Name: idx_saldo_mov_saldo; Type: INDEX; Schema: public; Owner: etiquetas2_app
--

CREATE INDEX idx_saldo_mov_saldo ON public.saldo_botellas_mov USING btree (saldo_id);


--
-- Name: cajas_preforma_mov cajas_preforma_mov_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.cajas_preforma_mov
    ADD CONSTRAINT cajas_preforma_mov_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.cajas_preforma(id) ON DELETE CASCADE;


--
-- Name: etiquetas_entries etiquetas_entries_maquina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.etiquetas_entries
    ADD CONSTRAINT etiquetas_entries_maquina_id_fkey FOREIGN KEY (maquina_id) REFERENCES public.machines(id) ON DELETE SET NULL;


--
-- Name: saldo_botellas_mov saldo_botellas_mov_saldo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.saldo_botellas_mov
    ADD CONSTRAINT saldo_botellas_mov_saldo_id_fkey FOREIGN KEY (saldo_id) REFERENCES public.saldo_botellas(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: etiquetas2_app
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict kgDnNxoJqW3cmt9JmDPBZV3A8Ui6oSEJUa1JRvXW85F5YNKsbnKMFbsAZ7FH6m3

