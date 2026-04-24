import { GoogleGenAI, Type } from "@google/genai";
import { ResumeData, initialResumeData } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
const modelName = "gemini-3-flash-preview";

export async function parseResumeMultimodal(base64Data: string, mimeType: string): Promise<ResumeData | null> {
  const prompt = `You are an expert resume parser. Extract every bit of information from the provided document into the following JSON schema.
  
  STRICT CONSTRAINTS:
  1. DO NOT translate common nouns, proper nouns (schools, companies, locations, names, project names). Keep them in the ORIGINAL language.
  2. For "description" and "summary" fields, preserve line breaks with "\\n".
  3. USE THE "●" CHARACTER FOR BULLET POINTS. Avoid using "-", "*", "l", or "|" as bullet markers.
  4. If sections in experience are grouped as "Category: content. Category: content", you MUST split them into separate lines starting with each category.
  5. "summary": Carefully extract the personal evaluation, introduction, or professional summary.
  6. "honors": Within each "education" entry, extract any scholarships, awards, or summary text.
  
  JSON Schema:
  {
    "personalInfo": { "name": "", "email": "", "phone": "", "location": "", "link": "", "summary": "" },
    "educations": [{ "id": "uuid1", "school": "", "degree": "", "major": "", "startDate": "", "endDate": "", "gpa": "", "honors": "" }],
    "experiences": [{ "id": "uuid2", "company": "", "role": "", "startDate": "", "endDate": "", "description": "" }],
    "projects": [{ "id": "uuid3", "name": "", "role": "", "startDate": "", "endDate": "", "description": "" }],
    "skills": [{ "id": "uuid4", "category": "", "skills": "" }]
  }
  
  Return ONLY the raw JSON object. Do not explain.`;

  console.log(`[Gemini] Starting parsing for ${mimeType}...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType } }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    console.log(`[Gemini] Response received. Status: OK`);
    const parsed = JSON.parse(response.text || "null");
    if (!parsed) throw new Error("Parsed result is null");
    
    // Safety check for critical fields
    if (!parsed.personalInfo) parsed.personalInfo = initialResumeData.personalInfo;
    if (!parsed.educations) parsed.educations = [];
    if (!parsed.experiences) parsed.experiences = [];
    if (!parsed.projects) parsed.projects = [];
    if (!parsed.skills) parsed.skills = [];
    
    return parsed;
  } catch (e) {
    console.error("[Gemini] Parsing error:", e);
    return null;
  }
}

export async function optimizeText(text: string, context: string, jd?: string): Promise<string> {
  const jdSection = jd ? `【目标岗位JD】:\n${jd}\n\n请在优化时，在不改变事实的前提下，尽量使用贴合该JD的专业术语。` : "";

  const prompt = `你是一名资深的简历优化专家。请根据以下【最高优先级红线规则】优化用户提供的简历片段。

【最高优先级红线规则 (绝对不可突破)】
1. 恪守事实，真实第一：100%基于用户输入的内容。严禁虚构、夸大、编造任何用户没有写的经历、项目、数据、成果。
2. 禁改基础信息：严禁修改岗位名称、公司名称、时间、学历院校、专业。
3. 动态提炼而非凭空捏造：只能对已有内容进行表达优化（如使用更贴合JD的行业术语），禁增任何原文没有的内容。
4. 结构完整：严禁因为内容与JD无关而删除原有表述，只能优化其表达方式。

【优化要求】
- 表达优化：将口语化描述转为职场专业术语，如“做了销售”优化为“主导销售渠道拓展及客户关系管理”。保持核心事实完全不变。
- 逻辑梳理：简历片段应条理清晰，可以使用符号增强可读性。
- 语言风格：专业、简洁、客观。

${jdSection}

用户原文 (${context}):
${text}

请直接输出优化后的文本，并在修改过的部分两端包裹 <opt> 和 </opt> 标签。如果全段都优化了，就全包裹。不要带有任何解释。`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });

  return response.text?.trim() || text;
}

export async function diagnoseResume(resume: ResumeData, jd: string): Promise<string> {
  const resumeStr = JSON.stringify(resume, null, 2);
  const prompt = `You are a professional hiring manager. Analyze the following resume against the given job description (JD).
  
  Please provide your analysis in CHINESE.
  
  1. Provide a matching score (0-100).
  2. Lists 3 key strengths.
  3. List 3 critical missing skills or areas for improvement.
  4. Give specific advice on how to tailor this resume for this specific JD.

  Job Description:
  ${jd}

  Resume:
  ${resumeStr}

  Output in Markdown format. Use clear headings.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });

  return response.text || "Analysis failed.";
}

export async function optimizeFullResume(resume: ResumeData, jd?: string): Promise<ResumeData> {
    const resumeStr = JSON.stringify(resume, null, 2);
    const jdSection = jd ? `【目标岗位JD】:\n${jd}` : "";

    const prompt = `你是一名资深的职场专家。请对完整的简历进行全方位智能优化。

【最高优先级红线规则 (绝对不可突破)】
1. 真实性铁律：必须100%基于原文。严禁编造任何虚构的经历、数据、荣誉、技能。如果用户没写，你绝不能加。
2. 信息准确性：姓名、联系方式、公司名称、院校名称、专业、职位名称、起止时间——这些基础信息一个字都不能改，更不能替换。
3.保留所有经历：严禁因为某段经历与目标JD无关就将其删除。必须保留用户所有的原有经历。
4. 事实不变：优化仅限于“表达方式”和“词汇选择”，严禁改变工作职责的核心事实。

【JD匹配优化规则 (当存在JD时)】
1. 亮点提炼：从用户已有的经历中，挖掘并重点突出与JD要求高度匹配的亮点。用更贴合JD的行业专业术语进行重构。
2. 顺序优化：如果在JSON数组中存在多个经历或项目，请根据与JD的相关性重新排序，将相关度最高的经历放在数组前面。
3. 重点偏移：对于与JD高度相关的经历，可以描述得更详细、专业；对于相关度低的经历，保持简洁但不可删除。

【输出格式要求】
1. 返回完整的JSON结构。
2. 对于任何被修改/优化过的文本字段（summary, honors, description, skills等），请在修改后的文字两端包裹 <opt> 和 </opt> 标签。
   例如："负责销售" 优化后为 "<opt>主导销售渠道拓展及客户关系管理</opt>"。

待优化的简历 JSON:
${resumeStr}

${jdSection}

请只返回优化后的 JSON 结构。不要包含任何 Markdown 格式块或解释文字。`;

    const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
    });

    try {
        const optimized = JSON.parse(response.text || "{}");
        return optimized as ResumeData;
    } catch (e) {
        console.error("Failed to parse optimized resume JSON", e);
        return resume;
    }
}

export async function parseJDMultimodal(base64Data: string, mimeType: string): Promise<string | null> {
  const prompt = `You are an expert recruitment assistant. Extract the full Job Description (JD) text from the provided image.
  Focus on:
  1. Job Title
  2. Responsibilities/Requirements
  3. Desired Skills
  
  Return the extracted text in a clean, readable format. Do not add any conversational filler.`;

  console.log(`[Gemini] Starting JD parsing for ${mimeType}...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType } }
      ],
    });

    return response.text?.trim() || null;
  } catch (e) {
    console.error("[Gemini] JD Parsing error:", e);
    return null;
  }
}
