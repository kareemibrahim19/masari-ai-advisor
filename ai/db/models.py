"""Masari database tables (SQLAlchemy 2.0).

The tables hold what ai/data/*.json holds today, so the tools and the website can switch from the files to the
database without changing the shape they read (export.py rebuilds the files' exact shape from these tables).

    program ─ rules and credit breakdown of the AIE program (one row)
    courses ─< course_prerequisites >─ courses
    elective_slots, elective_pools ─< elective_pool_slots / elective_pool_courses
    advisors ─< students ─┬─ guardians, previous_qualifications, academic_status   (one row each)
                          └─< student_terms ─< course_results >─ courses, instructors
    instructors ─< offerings >─ courses          (survey profiles per section)
    instructors ─< instructor_course_years >─ courses   (students' grades with the instructor, per year)
    section_seats >─ courses                     (capacity and enrolled per section, same key as offerings)
    meta         ─ small key/value facts (current term, survey dimensions, data notes)
    chats ─< chat_messages                       (a student's recent chats with Masari, saved by the website)
    student_choices, seat_requests, accounts     (what students save; never dropped by seed --reset)

course_results.instructor_id / section say who taught the student that course (was
student_instructor_history.json); they are empty where it is not known (current term, trainings, projects).
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Meta(Base):
    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)


# ------------------------------------------------------------------------------------------------ program

class Program(Base):
    __tablename__ = "program"

    id: Mapped[int] = mapped_column(primary_key=True)
    name_ar: Mapped[str] = mapped_column(Text)
    name_en: Mapped[str] = mapped_column(Text)
    faculty: Mapped[str] = mapped_column(Text)
    total_credits: Mapped[int]
    semesters: Mapped[int]
    electives_required: Mapped[int]
    source: Mapped[str | None] = mapped_column(Text)
    credit_breakdown: Mapped[dict] = mapped_column(JSON)
    # Credit limits, warning, graduation, grading scale... read by the rules engine as one document.
    rules: Mapped[dict] = mapped_column(JSON)


class Course(Base):
    __tablename__ = "courses"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)  # "ARI 381"
    seq: Mapped[int] = mapped_column(default=0)  # order in the program guide's catalog
    name_ar: Mapped[str] = mapped_column(Text)
    name_en: Mapped[str] = mapped_column(Text)
    credits: Mapped[int]
    category: Mapped[str] = mapped_column(String(32))  # university / college / specialization / project ...
    type: Mapped[str] = mapped_column(String(32))  # mandatory / elective
    department: Mapped[str] = mapped_column(String(16))
    weekly_load_hours: Mapped[int]
    level: Mapped[int]
    planned_semester: Mapped[int | None]
    min_level_required: Mapped[int | None]
    min_credits_required: Mapped[int | None]  # credit-hour threshold (projects, training)
    graded: Mapped[bool] = mapped_column(Boolean)
    graduation_requirement: Mapped[bool | None] = mapped_column(Boolean)
    assessment: Mapped[dict] = mapped_column(JSON)  # {"midterm": 20, "coursework": 30, "final": 50, ...}
    description_en: Mapped[str | None] = mapped_column(Text)
    # Aliases, notes and where each fact came from (name_en_source, prerequisites_source, ...).
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

    prerequisites: Mapped[list["CoursePrerequisite"]] = relationship(
        foreign_keys="CoursePrerequisite.course_code", order_by="CoursePrerequisite.position",
        cascade="all, delete-orphan")


class CoursePrerequisite(Base):
    __tablename__ = "course_prerequisites"

    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code", ondelete="CASCADE"), primary_key=True)
    prerequisite_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), primary_key=True)
    position: Mapped[int] = mapped_column(default=0)


class ElectiveSlot(Base):
    __tablename__ = "elective_slots"

    slot: Mapped[str] = mapped_column(String(8), primary_key=True)  # "E1"
    semester: Mapped[int]
    level: Mapped[int]


class ElectivePool(Base):
    __tablename__ = "elective_pools"

    id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[int]
    choose: Mapped[int]  # how many courses the student takes from this pool

    slots: Mapped[list["ElectivePoolSlot"]] = relationship(order_by="ElectivePoolSlot.position",
                                                           cascade="all, delete-orphan")
    courses: Mapped[list["ElectivePoolCourse"]] = relationship(order_by="ElectivePoolCourse.position",
                                                               cascade="all, delete-orphan")


class ElectivePoolSlot(Base):
    __tablename__ = "elective_pool_slots"

    pool_id: Mapped[int] = mapped_column(ForeignKey("elective_pools.id", ondelete="CASCADE"), primary_key=True)
    slot: Mapped[str] = mapped_column(ForeignKey("elective_slots.slot"), primary_key=True)
    position: Mapped[int] = mapped_column(default=0)


class ElectivePoolCourse(Base):
    __tablename__ = "elective_pool_courses"

    pool_id: Mapped[int] = mapped_column(ForeignKey("elective_pools.id", ondelete="CASCADE"), primary_key=True)
    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), primary_key=True)
    position: Mapped[int] = mapped_column(default=0)


# ------------------------------------------------------------------------------------------------ people

class Advisor(Base):
    __tablename__ = "advisors"

    advisor_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name_ar: Mapped[str] = mapped_column(Text)
    name_en: Mapped[str] = mapped_column(Text)
    title_ar: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    office_ar: Mapped[str | None] = mapped_column(Text)
    office_hours_ar: Mapped[str | None] = mapped_column(Text)

    students: Mapped[list["Student"]] = relationship(back_populates="advisor", order_by="Student.student_id")


class Student(Base):
    __tablename__ = "students"

    student_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    # personal
    name_ar: Mapped[str] = mapped_column(Text)
    name_en: Mapped[str] = mapped_column(Text)
    gender: Mapped[str] = mapped_column(String(16))
    birth_date: Mapped[date | None] = mapped_column(Date)
    birth_place: Mapped[str | None] = mapped_column(Text)
    nationality: Mapped[str | None] = mapped_column(Text)
    national_id: Mapped[str | None] = mapped_column(String(32), unique=True)
    id_type: Mapped[str | None] = mapped_column(Text)
    # contact
    governorate: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    mobile: Mapped[str | None] = mapped_column(String(32))
    university_email: Mapped[str | None] = mapped_column(String(255), unique=True)
    # enrollment
    university: Mapped[str] = mapped_column(Text)
    faculty: Mapped[str] = mapped_column(Text)
    program: Mapped[str] = mapped_column(Text)
    enrollment_year: Mapped[str] = mapped_column(String(16))  # "2024-2025"

    advisor_id: Mapped[str | None] = mapped_column(ForeignKey("advisors.advisor_id"))
    # Mock data only: which demo case this student shows (e.g. "probation") and a note about it.
    persona: Mapped[str | None] = mapped_column(String(32))
    persona_note: Mapped[str | None] = mapped_column(Text)

    advisor: Mapped[Advisor | None] = relationship(back_populates="students")
    guardian: Mapped["Guardian | None"] = relationship(cascade="all, delete-orphan")
    previous_qualification: Mapped["PreviousQualification | None"] = relationship(cascade="all, delete-orphan")
    academic_status: Mapped["AcademicStatus | None"] = relationship(cascade="all, delete-orphan")
    terms: Mapped[list["StudentTerm"]] = relationship(back_populates="student", order_by="StudentTerm.seq",
                                                      cascade="all, delete-orphan")


class Guardian(Base):
    __tablename__ = "guardians"

    student_id: Mapped[str] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    relation: Mapped[str | None] = mapped_column(Text)
    job: Mapped[str | None] = mapped_column(Text)
    mobile: Mapped[str | None] = mapped_column(String(32))


class PreviousQualification(Base):
    __tablename__ = "previous_qualifications"

    student_id: Mapped[str] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), primary_key=True)
    qualification: Mapped[str] = mapped_column(Text)  # "ثانوي عام رياضة"
    year: Mapped[str | None] = mapped_column(String(16))
    total: Mapped[float | None] = mapped_column(Float)
    max_total: Mapped[int | None]  # 410
    percentage: Mapped[float | None] = mapped_column(Float)
    round: Mapped[str | None] = mapped_column(Text)
    transferred_from: Mapped[str | None] = mapped_column(Text)


class AcademicStatus(Base):
    """The portal's hours-progress view of a student, as of the current term."""
    __tablename__ = "academic_status"

    student_id: Mapped[str] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[int]
    level_name: Mapped[str] = mapped_column(String(32))  # Freshman .. Senior
    required_hours: Mapped[int]
    earned_hours: Mapped[int]
    mandatory_hours: Mapped[int]
    elective_hours: Mapped[int]
    project_hours: Mapped[int]
    trainings_passed: Mapped[list] = mapped_column(JSON, default=list)  # course codes
    cumulative_gpa: Mapped[float | None] = mapped_column(Float)  # null before the first term has results
    main_semesters_completed: Mapped[int]
    academic_standing: Mapped[str] = mapped_column(Text)
    consecutive_warning_semesters: Mapped[int]
    current_academic_year: Mapped[str] = mapped_column(String(16))
    current_term_ar: Mapped[str] = mapped_column(Text)
    current_registered_hours: Mapped[int]


# ------------------------------------------------------------------------------------------------ grades

class StudentTerm(Base):
    __tablename__ = "student_terms"
    __table_args__ = (UniqueConstraint("student_id", "academic_year", "term"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    seq: Mapped[int]  # order of the term in the student's record
    academic_year: Mapped[str] = mapped_column(String(16))
    term: Mapped[str] = mapped_column(String(16))  # fall / spring / summer
    term_ar: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))  # published / in_progress
    # Term summary (published terms only)
    registered_hours: Mapped[int | None]
    earned_hours: Mapped[int | None]
    term_gpa: Mapped[float | None] = mapped_column(Float)
    cumulative_gpa: Mapped[float | None] = mapped_column(Float)
    cumulative_earned_hours: Mapped[int | None]
    academic_standing: Mapped[str | None] = mapped_column(Text)  # not given for summer terms

    student: Mapped[Student] = relationship(back_populates="terms")
    results: Mapped[list["CourseResult"]] = relationship(back_populates="term_row", order_by="CourseResult.position",
                                                         cascade="all, delete-orphan")


class CourseResult(Base):
    """One course a student registered in one term, with its marks and grade once published."""
    __tablename__ = "course_results"
    __table_args__ = (UniqueConstraint("term_id", "course_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("student_terms.id", ondelete="CASCADE"), index=True)
    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), index=True)
    position: Mapped[int] = mapped_column(default=0)
    attempt: Mapped[int] = mapped_column(default=1)
    # Marks differ by course (midterm, coursework, practical, final, oral_discussion ...), so they stay a document.
    marks: Mapped[dict | None] = mapped_column(JSON)
    total: Mapped[int | None]  # out of 100
    grade: Mapped[str | None] = mapped_column(String(4))  # A+ .. F, W ... (empty while in progress)
    grade_ar: Mapped[str | None] = mapped_column(String(8))
    # Who taught it (for instructor recommendations); unknown for the current term, trainings and projects.
    instructor_id: Mapped[str | None] = mapped_column(ForeignKey("instructors.id"), index=True)
    section: Mapped[str | None] = mapped_column(String(8))

    term_row: Mapped[StudentTerm] = relationship(back_populates="results")
    course: Mapped[Course] = relationship()


# ------------------------------------------------------------------------------------------------ instructors

class Instructor(Base):
    __tablename__ = "instructors"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # "i1"
    name_ar: Mapped[str] = mapped_column(Text)
    name_en: Mapped[str] = mapped_column(Text)
    department: Mapped[str] = mapped_column(String(16))
    style: Mapped[str | None] = mapped_column(String(32))
    responses: Mapped[int] = mapped_column(default=0)  # survey answers behind the profile
    # Average survey scores 0-100 on the dimensions in meta["instructor_dimensions"] (clarity, pace, ...).
    profile: Mapped[dict] = mapped_column(JSON)


class Offering(Base):
    """A section of a course taught by an instructor, with the survey profile for that section."""
    __tablename__ = "offerings"
    __table_args__ = (UniqueConstraint("course_code", "section", "offered_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), index=True)
    section: Mapped[str] = mapped_column(String(8))
    instructor_id: Mapped[str] = mapped_column(ForeignKey("instructors.id"), index=True)
    offered_term: Mapped[str] = mapped_column(String(16))
    responses: Mapped[int] = mapped_column(default=0)
    profile: Mapped[dict] = mapped_column(JSON)


class InstructorCourseYear(Base):
    """How the students of one course did with its instructor in one academic year (was instructor_grades.json),
    for recommending instructors by their students' grades. Who teaches each course this term, the years covered
    and the GPA band names are in meta."""
    __tablename__ = "instructor_course_years"
    __table_args__ = (UniqueConstraint("course_code", "academic_year", "instructor_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    instructor_id: Mapped[str] = mapped_column(ForeignKey("instructors.id"), index=True)
    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), index=True)
    academic_year: Mapped[str] = mapped_column(String(16))
    position: Mapped[int] = mapped_column(default=0)  # order in instructor_grades.json
    students: Mapped[int]
    mean: Mapped[float] = mapped_column(Float)
    median: Mapped[float] = mapped_column(Float)
    pass_rate: Mapped[float] = mapped_column(Float)
    grades: Mapped[dict] = mapped_column(JSON)  # {"A+": 1, "A": 4, ..., "F": 25}
    coursework_avg_pct: Mapped[float] = mapped_column(Float)
    final_avg_pct: Mapped[float] = mapped_column(Float)
    bonus_added: Mapped[bool] = mapped_column(Boolean)
    by_gpa_band: Mapped[dict] = mapped_column(JSON)  # mean total per band of student GPA (keys in meta["gpa_bands"])


class SectionSeats(Base):
    """How many seats a section has and how many are taken (ai/data/sections.json; simulated until the faculty's
    registration system gives the real numbers). Same key as the offering: course, section, term."""
    __tablename__ = "section_seats"

    course_code: Mapped[str] = mapped_column(ForeignKey("courses.code"), primary_key=True)
    section: Mapped[str] = mapped_column(String(8), primary_key=True)
    offered_term: Mapped[str] = mapped_column(String(16), primary_key=True)
    position: Mapped[int] = mapped_column(default=0)  # order in sections.json
    capacity: Mapped[int]
    enrolled: Mapped[int]


# ------------------------------------------------------------------------------------------------ chats

class Chat(Base):
    """One conversation of a student with Masari, as listed under "Recent chats" on the chat page.

    The website makes the id (a UUID) when the chat gets its first message, so it can save before the server
    answers. student_id is not a foreign key yet: the AI service still reads students from students.json, so the
    students table may be empty. It checks the id against that file instead (see db/chats.py).
    """
    __tablename__ = "chats"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    title: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # UTC; the list is newest first

    messages: Mapped[list["ChatMessageRow"]] = relationship(order_by="ChatMessageRow.position",
                                                            cascade="all, delete-orphan")


class ChatMessageRow(Base):
    """One message of a chat. `message` is the website's message object as it is (user question, Masari's answer
    with its sources and advisor email, or an error), so the chat comes back exactly as it was on screen."""
    __tablename__ = "chat_messages"

    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(16))  # user / assistant
    message: Mapped[dict] = mapped_column(JSON)


# ------------------------------------------------------------------------------------------------ choices

class StudentChoices(Base):
    """What a student chose on the recommendations page (the courses on the schedule),
    saved so it is still there after a refresh or on another device (see db/choices.py). Like the chats it is not a
    foreign key to students and is never dropped by seed --reset."""
    __tablename__ = "student_choices"

    student_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    choices: Mapped[dict] = mapped_column(JSON)  # {selected: [...]}
    updated_at: Mapped[datetime] = mapped_column(DateTime)  # UTC, as sent by the website; the newest save wins


class SeatRequest(Base):
    """A student asking for a seat in a full section ("Request a seat" on the website), for the faculty to review.
    One request per student, section and term; like the chats it is never dropped by seed --reset."""
    __tablename__ = "seat_requests"
    __table_args__ = (UniqueConstraint("student_id", "course_code", "section", "offered_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    course_code: Mapped[str] = mapped_column(String(16))
    section: Mapped[str] = mapped_column(String(8))
    offered_term: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending; later approved / declined
    created_at: Mapped[datetime] = mapped_column(DateTime)  # UTC


# ------------------------------------------------------------------------------------------------ accounts

class Account(Base):
    """A student's sign-in password, kept only as a salted hash (see db/accounts.py). Like the chats it is not a
    foreign key to students and is never dropped by seed --reset, so passwords survive reloading the data."""
    __tablename__ = "accounts"

    student_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    updated_at: Mapped[datetime] = mapped_column(DateTime)  # UTC, when the password was last set
