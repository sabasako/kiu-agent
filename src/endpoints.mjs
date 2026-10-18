// Endpoint knowledge, relative to https://lms.kiu.edu.ge/student
//
// READ_ONLY: endpoints reviewed as plain reads. With guard "read-only" (config.json) these
// are the only ones the client will call.
// MARKS_OR_WRITES: look like reads or are obvious writes, but change something (submit,
// delete, register, mark as read/seen...). Never call these without the student's explicit
// yes for that exact call.
//
// The LMS uses POST for plain reads too, so the HTTP method says nothing. Classify by what
// the frontend code does with the endpoint (see AGENTS.md "Repairing").
// This list was reviewed in October 2026 and can be out of date: `kiu discover` diffs it
// against the live site.

export const READ_ONLY = new Set([
  // LMS
  '/lms/learningCourses/list',
  '/lms/learningCourses/getCourse',
  '/lms/learningCourses/getGroup',
  '/lms/learningCourses/groupList',
  '/lms/learningCourses/getLmsStudentNotifications',
  '/lms/learningCourses/group/getAssignmentList',
  '/lms/learningCourses/group/getAssignment',
  '/lms/learningCourses/group/getMaterialList',
  '/lms/learningCourses/group/announcementList',
  '/lms/learningCourses/group/getEstListComponents',
  // academic record
  '/registration/getStudentData',
  '/registration/getStudentHistory',
  '/registration/getStudentInfo',
  '/registration/getStudentTables',
  '/registration/group/getGroupForRegistration',
  '/registration/groupOption',
  '/registration/groups',
  '/registration/getEducations',
  '/registration/getProgram',
  '/registration/getMyBookGroups',
  '/registration/getBookResults',
  '/registration/getRegistrationBooks',
  '/registration/getConcentrationInfo',
  '/registration/getLists',
  '/registration/getMinorList',
  '/registration/allSelectablePrograms',
  '/stat/gpaBySemester',
  '/stat/gpaBySeason',
  '/tables/getAcTables/',
  '/dashboardInfo/',
  '/getStudentTaskBooks/',
  '/tasks/',
  '/task/getUnreadTaskCount',
  // e-learning / calendar
  '/el-learning/getStudentEventList/',
  '/el-learning/getZoomLinks',
  '/el-learning/getUnreadElLearningCount',
  '/hr/calendar/getItems',
  '/hr/calendar/getMandatoryEvents',
  '/hr/calendar/getNativeList/',
  // finances
  '/finances/getStudentFinances',
  '/finances/getStudentEvents/',
  '/finances/getEventsNew/',
  '/finances/getLearningYearNew',
  '/finances/getVerifyStatus',
  // messages / notifications: lists and counts only
  '/message/count',
  '/message/inbox/',
  '/notification/get/',
  '/notification/getUnreadNotificationCount',
  '/userNotification/getUnreadUserNotificationCount',
  '/commands/',
  // other
  '/bib/getOutedStudentExemplarBooks/',
  '/bib/getOverdueState',
  '/bib/getBookingInfo',
  '/chancellery/getStudentSentJournals/',
  '/chancellery/getUserInfo',
  '/fellowship/getStudentDates/',
  '/fellowship/showFellowshipMenu',
  '/poll/getPollResponseList/',
  '/poll/getPollForAlert', // the web app calls it on every login and every 60s; saving is saveAlertSeen
  '/quickAlert/checkStipendiaInfo',
  '/lang/list',
  '/setting/get',
]);

export const MARKS_OR_WRITES = {
  '/lms/learningCourses/group/setAssignmentsSeenForStudent': 'marks homework as seen',
  '/lms/learningCourses/group/writeAssignment': 'submits homework',
  '/lms/learningCourses/group/removeAssignmentAnswer': 'deletes your submission',
  '/lms/learningCourses/group/removeAssignmentAttachment': 'deletes a submitted file',
  '/task/markAsReadTasks': 'marks tasks read',
  '/notification/read': 'marks notifications read',
  '/message/view': 'opens a message, marks it read',
  '/el-learning/readAllEvent/': 'marks e-learning events read',
  '/hr/calendar/seen': 'marks a calendar event seen',
  '/bib/acknowledgeOverdue': 'acknowledges a library overdue notice',
  '/poll/saveAlertSeen': 'marks a poll alert seen',
  '/chancellery/makeDocRequest': 'requests an official document',
  '/fellowship/reserveDate': 'reserves a fellowship slot',
  '/registration/register': 'course registration',
  '/registration/registerList': 'course registration',
};

// "/tasks/?page=1&limit=20" -> "/tasks/"
export const endpointOf = (p) => p.split('?')[0];
