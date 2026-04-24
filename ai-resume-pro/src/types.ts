export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  link: string;
  summary?: string;
  photo?: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  honors?: string;
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Project {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface SkillSet {
  id: string;
  category: string;
  skills: string;
}

export interface ResumeLabels {
  summary: string;
  education: string;
  experience: string;
  projects: string;
  skills: string;
}

export interface ResumeTheme {
  fontFamily: 'sans' | 'serif' | 'mono';
  accentColor: string;
  fontSize: 'sm' | 'base' | 'lg';
  layout: 'standard' | 'modern' | 'compact';
}

export interface SectionVisibility {
  summary: boolean;
  education: boolean;
  experience: boolean;
  projects: boolean;
  skills: boolean;
}

export interface ResumeData {
  personalInfo: PersonalInfo;
  educations: Education[];
  experiences: Experience[];
  projects: Project[];
  skills: SkillSet[];
  theme?: ResumeTheme;
  labels?: ResumeLabels;
  sectionVisibility?: SectionVisibility;
}

export const initialResumeData: ResumeData = {
  personalInfo: {
    name: "",
    email: "",
    phone: "",
    location: "",
    link: "",
    summary: ""
  },
  educations: [],
  experiences: [],
  projects: [],
  skills: [],
  labels: {
    summary: "自我评价",
    education: "教育背景",
    experience: "工作经历",
    projects: "项目经历",
    skills: "专业技能"
  },
  sectionVisibility: {
    summary: true,
    education: true,
    experience: true,
    projects: true,
    skills: true
  },
  theme: {
    fontFamily: 'serif',
    accentColor: '#1e293b',
    fontSize: 'base',
    layout: 'standard'
  }
};
