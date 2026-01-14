--
-- PostgreSQL database dump
--

\restrict O1bJ06eGXidCoEH5Y2Jg6d1AYB6DlgcphdfpooL5tgyVZF1bAGnXM5COoI2UbRD

-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: annotationstatus; Type: TYPE; Schema: public; Owner: ccastellon
--

CREATE TYPE public.annotationstatus AS ENUM (
    'OUI',
    'NON',
    'DOUTEUX',
    'UNREVIEWED',
    'DISCARDED'
);


ALTER TYPE public.annotationstatus OWNER TO ccastellon;

--
-- Name: userrole; Type: TYPE; Schema: public; Owner: ccastellon
--

CREATE TYPE public.userrole AS ENUM (
    'admin',
    'annotator',
    'validator'
);


ALTER TYPE public.userrole OWNER TO ccastellon;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO ccastellon;

--
-- Name: alignments_alignment_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.alignments_alignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.alignments_alignment_id_seq OWNER TO ccastellon;

--
-- Name: alignments; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.alignments (
    alignment_id integer DEFAULT nextval('public.alignments_alignment_id_seq'::regclass) NOT NULL,
    source_passage_id integer NOT NULL,
    target_passage_id integer NOT NULL,
    levenshtein_similarity double precision,
    vector_similarity double precision,
    diff_data json,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.alignments OWNER TO ccastellon;

--
-- Name: annotations_annotation_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.annotations_annotation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.annotations_annotation_id_seq OWNER TO ccastellon;

--
-- Name: annotations; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.annotations (
    annotation_id integer DEFAULT nextval('public.annotations_annotation_id_seq'::regclass) NOT NULL,
    alignment_id integer NOT NULL,
    user_id integer NOT NULL,
    status public.annotationstatus NOT NULL,
    comment text,
    annotation_metadata json,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.annotations OWNER TO ccastellon;

--
-- Name: authors_author_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.authors_author_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.authors_author_id_seq OWNER TO ccastellon;

--
-- Name: authors; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.authors (
    author_id integer DEFAULT nextval('public.authors_author_id_seq'::regclass) NOT NULL,
    name character varying(255) NOT NULL,
    bnf_name character varying(255),
    bnf_ark character varying(255),
    birth_date date,
    death_date date,
    birth_place character varying(255),
    death_place character varying(255),
    country character varying(100),
    language character varying(50),
    gender character varying(50),
    notes text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.authors OWNER TO ccastellon;

--
-- Name: cluster_meta; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.cluster_meta (
    cluster_id integer NOT NULL,
    oldest_alignment_id integer,
    oldest_source_passage_id integer,
    oldest_text_id integer,
    oldest_filename text,
    oldest_text_date date,
    computed_at timestamp without time zone DEFAULT now() NOT NULL,
    triangles_count integer,
    ref_triangle_id integer,
    trio_sorted text
);


ALTER TABLE public.cluster_meta OWNER TO ccastellon;

--
-- Name: cluster_meta_cluster_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.cluster_meta_cluster_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cluster_meta_cluster_id_seq OWNER TO ccastellon;

--
-- Name: cluster_meta_cluster_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ccastellon
--

ALTER SEQUENCE public.cluster_meta_cluster_id_seq OWNED BY public.cluster_meta.cluster_id;


--
-- Name: human_annotations; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.human_annotations (
    annotation_id integer,
    alignment_id integer,
    user_id integer,
    status public.annotationstatus,
    comment text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    source_filename character varying(255),
    source_start_byte integer,
    target_filename character varying(255),
    target_start_byte integer
);


ALTER TABLE public.human_annotations OWNER TO ccastellon;

--
-- Name: list_alignments; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.list_alignments (
    list_id integer NOT NULL,
    alignment_id integer NOT NULL,
    added_at timestamp without time zone DEFAULT now(),
    notes character varying(255)
);


ALTER TABLE public.list_alignments OWNER TO ccastellon;

--
-- Name: lists_list_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.lists_list_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.lists_list_id_seq OWNER TO ccastellon;

--
-- Name: lists; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.lists (
    list_id integer DEFAULT nextval('public.lists_list_id_seq'::regclass) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    user_id integer NOT NULL,
    is_public boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.lists OWNER TO ccastellon;

--
-- Name: passages_passage_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.passages_passage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.passages_passage_id_seq OWNER TO ccastellon;

--
-- Name: passages; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.passages (
    passage_id integer DEFAULT nextval('public.passages_passage_id_seq'::regclass) NOT NULL,
    text_id integer NOT NULL,
    content text NOT NULL,
    context_before text,
    context_after text,
    start_byte integer,
    end_byte integer,
    word_count integer,
    language character varying(50),
    automatic_classification character varying(100),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.passages OWNER TO ccastellon;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.roles (
    role_id integer NOT NULL,
    name character varying NOT NULL,
    description character varying
);


ALTER TABLE public.roles OWNER TO ccastellon;

--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.roles_role_id_seq OWNER TO ccastellon;

--
-- Name: roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ccastellon
--

ALTER SEQUENCE public.roles_role_id_seq OWNED BY public.roles.role_id;


--
-- Name: text_authors; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.text_authors (
    text_id integer NOT NULL,
    author_id integer NOT NULL,
    created_at timestamp without time zone
);


ALTER TABLE public.text_authors OWNER TO ccastellon;

--
-- Name: texts_text_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.texts_text_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.texts_text_id_seq OWNER TO ccastellon;

--
-- Name: texts; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.texts (
    text_id integer DEFAULT nextval('public.texts_text_id_seq'::regclass) NOT NULL,
    title character varying(500) NOT NULL,
    filename character varying(255) NOT NULL,
    publication_date date,
    first_publication_date date,
    classification character varying(100),
    word_length integer,
    title_key character varying(255),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.texts OWNER TO ccastellon;

--
-- Name: triangles; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.triangles (
    id_triangle integer NOT NULL,
    alignment_ab_id integer NOT NULL,
    alignment_bc_id integer NOT NULL,
    alignment_ac_id integer NOT NULL,
    cluster_id integer NOT NULL,
    source_file text NOT NULL,
    completeness text NOT NULL,
    consistency text NOT NULL,
    confidence double precision,
    can_propagate boolean,
    old_alignment_concatenated text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    ab_annotation_status character varying,
    ab_annotation_comment text,
    ac_annotation_status character varying,
    ac_annotation_comment text,
    bc_annotation_status character varying,
    bc_annotation_comment text
);


ALTER TABLE public.triangles OWNER TO ccastellon;

--
-- Name: triangles_id_triangle_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.triangles_id_triangle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.triangles_id_triangle_seq OWNER TO ccastellon;

--
-- Name: triangles_id_triangle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ccastellon
--

ALTER SEQUENCE public.triangles_id_triangle_seq OWNED BY public.triangles.id_triangle;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL
);


ALTER TABLE public.user_roles OWNER TO ccastellon;

--
-- Name: users; Type: TABLE; Schema: public; Owner: ccastellon
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role public.userrole,
    preferences json,
    last_login timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO ccastellon;

--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: ccastellon
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_user_id_seq OWNER TO ccastellon;

--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ccastellon
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: cluster_meta cluster_id; Type: DEFAULT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.cluster_meta ALTER COLUMN cluster_id SET DEFAULT nextval('public.cluster_meta_cluster_id_seq'::regclass);


--
-- Name: roles role_id; Type: DEFAULT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.roles ALTER COLUMN role_id SET DEFAULT nextval('public.roles_role_id_seq'::regclass);


--
-- Name: triangles id_triangle; Type: DEFAULT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles ALTER COLUMN id_triangle SET DEFAULT nextval('public.triangles_id_triangle_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: alignments alignments_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.alignments
    ADD CONSTRAINT alignments_pkey PRIMARY KEY (alignment_id);


--
-- Name: annotations annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.annotations
    ADD CONSTRAINT annotations_pkey PRIMARY KEY (annotation_id);


--
-- Name: authors authors_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (author_id);


--
-- Name: cluster_meta cluster_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.cluster_meta
    ADD CONSTRAINT cluster_meta_pkey PRIMARY KEY (cluster_id);


--
-- Name: list_alignments list_alignments_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.list_alignments
    ADD CONSTRAINT list_alignments_pkey PRIMARY KEY (list_id, alignment_id);


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (list_id);


--
-- Name: passages passages_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.passages
    ADD CONSTRAINT passages_pkey PRIMARY KEY (passage_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: text_authors text_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.text_authors
    ADD CONSTRAINT text_authors_pkey PRIMARY KEY (text_id, author_id);


--
-- Name: texts texts_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.texts
    ADD CONSTRAINT texts_pkey PRIMARY KEY (text_id);


--
-- Name: triangles triangles_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles
    ADD CONSTRAINT triangles_pkey PRIMARY KEY (id_triangle);


--
-- Name: triangles uq_triangles_alignment_triplet; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles
    ADD CONSTRAINT uq_triangles_alignment_triplet UNIQUE (alignment_ab_id, alignment_bc_id, alignment_ac_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: idx_alignments_source_passage_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_alignments_source_passage_id ON public.alignments USING btree (source_passage_id);


--
-- Name: idx_alignments_target_passage_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_alignments_target_passage_id ON public.alignments USING btree (target_passage_id);


--
-- Name: idx_annotations_alignment_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_annotations_alignment_id ON public.annotations USING btree (alignment_id);


--
-- Name: idx_annotations_user_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_annotations_user_id ON public.annotations USING btree (user_id);


--
-- Name: idx_list_alignments_alignment_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_list_alignments_alignment_id ON public.list_alignments USING btree (alignment_id);


--
-- Name: idx_list_alignments_list_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_list_alignments_list_id ON public.list_alignments USING btree (list_id);


--
-- Name: idx_passages_text_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX idx_passages_text_id ON public.passages USING btree (text_id);


--
-- Name: ix_cluster_meta_oldest_alignment_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_cluster_meta_oldest_alignment_id ON public.cluster_meta USING btree (oldest_alignment_id);


--
-- Name: ix_cluster_meta_oldest_text_date; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_cluster_meta_oldest_text_date ON public.cluster_meta USING btree (oldest_text_date);


--
-- Name: ix_cluster_meta_ref_triangle_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_cluster_meta_ref_triangle_id ON public.cluster_meta USING btree (ref_triangle_id);


--
-- Name: ix_cluster_meta_triangles_count; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_cluster_meta_triangles_count ON public.cluster_meta USING btree (triangles_count);


--
-- Name: ix_triangles_id_triangle; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_triangles_id_triangle ON public.triangles USING btree (id_triangle);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_user_id; Type: INDEX; Schema: public; Owner: ccastellon
--

CREATE INDEX ix_users_user_id ON public.users USING btree (user_id);


--
-- Name: alignments alignments_source_passage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.alignments
    ADD CONSTRAINT alignments_source_passage_id_fkey FOREIGN KEY (source_passage_id) REFERENCES public.passages(passage_id);


--
-- Name: alignments alignments_target_passage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.alignments
    ADD CONSTRAINT alignments_target_passage_id_fkey FOREIGN KEY (target_passage_id) REFERENCES public.passages(passage_id);


--
-- Name: annotations annotations_alignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.annotations
    ADD CONSTRAINT annotations_alignment_id_fkey FOREIGN KEY (alignment_id) REFERENCES public.alignments(alignment_id);


--
-- Name: annotations annotations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.annotations
    ADD CONSTRAINT annotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: list_alignments list_alignments_alignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.list_alignments
    ADD CONSTRAINT list_alignments_alignment_id_fkey FOREIGN KEY (alignment_id) REFERENCES public.alignments(alignment_id);


--
-- Name: list_alignments list_alignments_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.list_alignments
    ADD CONSTRAINT list_alignments_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(list_id);


--
-- Name: lists lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: passages passages_text_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.passages
    ADD CONSTRAINT passages_text_id_fkey FOREIGN KEY (text_id) REFERENCES public.texts(text_id);


--
-- Name: text_authors text_authors_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.text_authors
    ADD CONSTRAINT text_authors_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.authors(author_id);


--
-- Name: text_authors text_authors_text_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.text_authors
    ADD CONSTRAINT text_authors_text_id_fkey FOREIGN KEY (text_id) REFERENCES public.texts(text_id);


--
-- Name: triangles triangles_alignment_ab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles
    ADD CONSTRAINT triangles_alignment_ab_id_fkey FOREIGN KEY (alignment_ab_id) REFERENCES public.alignments(alignment_id);


--
-- Name: triangles triangles_alignment_ac_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles
    ADD CONSTRAINT triangles_alignment_ac_id_fkey FOREIGN KEY (alignment_ac_id) REFERENCES public.alignments(alignment_id);


--
-- Name: triangles triangles_alignment_bc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.triangles
    ADD CONSTRAINT triangles_alignment_bc_id_fkey FOREIGN KEY (alignment_bc_id) REFERENCES public.alignments(alignment_id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ccastellon
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict O1bJ06eGXidCoEH5Y2Jg6d1AYB6DlgcphdfpooL5tgyVZF1bAGnXM5COoI2UbRD

