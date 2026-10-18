# LMS endpoints

Base URL: `https://lms.kiu.edu.ge/student` + endpoint. Auth: `Authorization: Bearer <token>` (the `Student-Token` the web app keeps in localStorage).

> Generated from real responses in October 2026, **shapes only** (no values). The LMS can change at any time: run `kiu discover` to diff against the live site and `kiu snapshot` for fresh data. Status 404/403 here means it did not work for a normal student account with the parameters tried, not that it never works.

## Read-only endpoints (the guard allowlist)

### `/lms/learningCourses/list`

- Method: POST
- Body: { learning_year: string, registrationGroupId: number }
- Status seen: 200

```
{ result: string, data: [{ listId: number, name: string, altName: string, items: [{...}], notifications: number }] }
```

### `/lms/learningCourses/getCourse`

- Method: POST
- Body: { id: number, groupId: number }
- Status seen: 200

```
{ result: string, groups: [], seminar_groups: [], is_registration: boolean, profs: [{ name: string, nameEng: string, id: number, jsonGuard: string }], data: { id: number, bookId: number, name: string, nameEng: null, status: string, credit: number, learningYear: string, learningSeason: string, studentCount: number, userId: number, registrationGroup: number, created_at: string, updated_at: string, registrationGroupId: number, signed: number, allowSign: number, reportDefault: null, reportProf: null, reportSpecialty: null, schoolIds: null, exam_apelation_from: null, exam_apelation_to: null, altName: string, groupName: string, groupType: string } }
```

### `/lms/learningCourses/getGroup`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, errors: { group_id: [string], list_id: [string] } }
```

### `/lms/learningCourses/groupList`

- Method: POST
- Body: -
- Status seen: 404

### `/lms/learningCourses/getLmsStudentNotifications`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, notifications: number }
```

### `/lms/learningCourses/group/getAssignmentList`

- Method: POST
- Body: { id: number, group_id: number, user_type: string }
- Status seen: 200

```
{ result: string, data: [{ id: number, group_id: number, title: string, description: null, status: string, week: string, file_urls: string, start_date: string, start_time: string, end_date: string, end_time: string, est_list_group_component_id: number, co_id: number, key: number, single_upload: boolean, batch_transfer: boolean, created_at: string, updated_at: string, student_submited_at: string, student_answer: null, student_files: string, student_comment: null, student_score: null, files: [string], in_testing: number }], sumInTesting: number, editor: boolean, type: string, notifications: number }
```

### `/lms/learningCourses/group/getAssignment`

Not exercised yet.

### `/lms/learningCourses/group/getMaterialList`

- Method: POST
- Body: { id: number, group_id: number }
- Status seen: 200

```
{ result: string, data: [{ id: number, group_id: number, file_urls: [string], title: string, description: string, created_at: string, updated_at: string }], editor: boolean }
```

### `/lms/learningCourses/group/announcementList`

- Method: POST
- Body: { id: number, group_id: number }
- Status seen: 200

```
{ result: string, data: [{ id: number, group_id: number, prof_id: number, title: string, file_urls: [], created_at: string, updated_at: string, course_group: { id: number, name: string, prof_id: string, list_id: number, group_ids: null, seminar_ids: string, status: string, type: string, is_registration: string, created_at: string, updated_at: string, professor: {...} }, professor: { id: number, name: string, nameEng: string, firstName: string, firstNameEng: string, lastName: string, lastNameEng: string, image: string, jsonGuard: string }, comments: [] }], editor: boolean }
```

### `/lms/learningCourses/group/getEstListComponents`

- Method: POST
- Body: { id: number, group_id: number }
- Status seen: 404

### `/registration/getStudentData`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, data: { student: { id: number, name: string, personalNumber: string, photo_code: string }, educationInfo: { id: number, studentId: number, schoolId: number, specId: number, programId: number, level: number, status: string, additionalStatus: null, method: number, learningYear: string, learningSeason: null, learningYearMobility: null, created_at: string, updated_at: string, licenseFile: string, personalFile: string, photo: string, militaryFile: string, learningFile: string, commandStartFile: string, commandStopFile: string, lang: null, score: null, langLevel: null, semester: number, grant: null, medalist: string, mobileYear: null, choose: null, langChange: null, specialChange: null, concentrationModule: null, concentrationGroup: null, concentrationLangGroup: null, syncKey: number, student_id_key: null, student_id_key2: null, minorProgramId: number, erasmus: number }, special: { id: number, name: string, altName: string, rotationName: null, maxSemester: number, created_at: string, updated_at: string, version: string, schoolId: number, hidden: string, restricted_minors: null }, program: { id: number, name: string, nameEng: string, qualificationName: null, qualificationNameEng: null, year: string, schoolId: number, specialId: number, type: number, level: string, status: string, description: null, created_at: string, updated_at: string, view: number, eduId: number }, view: { id: number, name: string, personalNumber: string, eduId: number, schoolId: number, schoolN
```

### `/registration/getStudentHistory`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, data: [{ id: number, season: string, seasonYear: string, year: number, limit: number, semesterLimit: number, comment: string, yearCreditIsLimited: null, yearCreditLimit: null, semesterCreditIsLimited: null, semesterCredit: null, virtualGroupCount: null, created_at: string, updated_at: string, canRegister: number, visible: number, concentrationType: string, studentCanCancel: number, show: number, finalRegistrationSuccess: number, freshman_reg: number, nashromi_registration: number, nashromi_cancel: number, praktika_registration: number, praktika_cancel: number, status: number, timeDemand: number, programs: [], semesters: [], exchange: number, cache: number, canRegisterContentration: number, canCancelContentration: number, canRegisterMinor: number, canCancelMinor: number, books: [] }] }
```

### `/registration/getStudentInfo`

- Method: POST
- Body: -
- Status seen: 200

```
{ calcCredits: null, student: { unblockGroupsValidation: number } }
```

### `/registration/getStudentTables`

- Method: POST
- Body: { studentId: number, eduId: number, groupId: number, dates: array }
- Status seen: 200

```
{ error: string, result: string }
```

### `/registration/group/getGroupForRegistration`

- Method: POST
- Body: -
- Status seen: 200

```
{ list: [{ id: number, season: string, seasonYear: string, year: number, limit: null, semesterLimit: null, comment: string, yearCreditIsLimited: null, yearCreditLimit: null, semesterCreditIsLimited: null, semesterCredit: null, virtualGroupCount: null, created_at: string, updated_at: string, canRegister: number, visible: number, concentrationType: string, studentCanCancel: number, show: number, finalRegistrationSuccess: number, freshman_reg: number, nashromi_registration: number, nashromi_cancel: number, praktika_registration: number, praktika_cancel: number, status: number, timeDemand: number, programs: [], semesters: [], exchange: number, cache: number, canRegisterContentration: number, canCancelContentration: number, canRegisterMinor: number, canCancelMinor: number }], selectedGroupId: number }
```

### `/registration/groupOption`

- Method: POST
- Body: { registrationGroupId: number }
- Status seen: 200

```
{ id: number, season: string, seasonYear: string, year: number, limit: null, semesterLimit: null, comment: string, yearCreditIsLimited: null, yearCreditLimit: null, semesterCreditIsLimited: null, semesterCredit: null, virtualGroupCount: null, created_at: string, updated_at: string, canRegister: number, visible: number, concentrationType: string, studentCanCancel: number, show: number, finalRegistrationSuccess: number, freshman_reg: number, nashromi_registration: number, nashromi_cancel: number, praktika_registration: number, praktika_cancel: number, status: number, timeDemand: number, programs: [], semesters: [], exchange: number, cache: number, canRegisterContentration: number, canCancelContentration: number, canRegisterMinor: number, canCancelMinor: number }
```

### `/registration/groups`

- Method: GET
- Body: -
- Status seen: 404

### `/registration/getEducations`

- Method: POST
- Body: { id: number }
- Status seen: 403

### `/registration/getProgram`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, errors: { id: [string] } }
```

### `/registration/getMyBookGroups`

- Method: POST
- Body: -
- Status seen: 200

```
[{ id: number, bookId: number, bookName: string, type: string, profName: string, day: number, h: number, m: number, auditoria: string }]
```

### `/registration/getBookResults`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, data: [{ id: number, type: string, studentId: number, listId: null, mobilityId: null, bookId: number, semester: number, bookName: string, score: number, result: string, confirm: string, credit: number, year: string, season: string, profId: string, profName: string, secondProfId: null, groupId: number, progId: number, specId: number, eduId: number, courseType: number, oldId: null, created_at: string, updated_at: string, oldBookId: null, oldBookName: null, oldProgId: null, oldGroupId: null, minorGroupId: number, book: { id: number, name: string, description: string, code: null, credit: number, ruleCheck: number, version: null, created_at: string, updated_at: string, hidden: number, type: string, status: string, gpaLimit: number, conditionStatus: number, componentCount: number, question_count: number, syllabuses: number, lang: null, ruleStudents: string, schoolIds: [number], specialIds: [number], deleted_at: null, creditLimit: null, programCreditLimit: null, requiredCreditLimit: null, testing_word_answer: number, langCode: string, nashromi_praqtika_type: null, semesters: null, link: string, allowCommentInList: boolean, showCommentsForStudents: boolean, studentVisibilityCheckbox: boolean, canEdit: boolean } }], view: null }
```

### `/registration/getRegistrationBooks`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, errors: string }
```

### `/registration/getConcentrationInfo`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, data: { program: { id: number, name: string, nameEng: string, qualificationName: null, qualificationNameEng: null, year: string, schoolId: number, specialId: number, type: number, level: string, status: string, description: null, created_at: string, updated_at: string, view: number, eduId: number }, educationInfo: { id: number, studentId: number, schoolId: number, specId: number, programId: number, level: number, status: string, additionalStatus: null, method: number, learningYear: string, learningSeason: null, learningYearMobility: null, created_at: string, updated_at: string, licenseFile: string, personalFile: string, photo: string, militaryFile: string, learningFile: string, commandStartFile: string, commandStopFile: string, lang: null, score: null, langLevel: null, semester: number, grant: null, medalist: string, mobileYear: null, choose: null, langChange: null, specialChange: null, concentrationModule: null, concentrationGroup: null, concentrationLangGroup: null, syncKey: number, student_id_key: null, student_id_key2: null, minorProgramId: number, erasmus: number }, registrationGroup: { id: number, season: string, seasonYear: string, year: number, limit: null, semesterLimit: null, comment: string, yearCreditIsLimited: null, yearCreditLimit: null, semesterCreditIsLimited: null, semesterCredit: null, virtualGroupCount: null, created_at: string, updated_at: string, canRegister: number, visible: number, concentrationType: string, studentCanCancel: number, s
```

### `/registration/getLists`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, data: [], selected: [{ id: number, studentId: number, registrationGroupId: number, groupId: number, bookId: number, eduId: number, canceled: number, lectureId: number, seminarId: number, listId: number, listGroupId: number, ipAddress: number, type: string, buyStatus: number, orderId: number, startedTime: null, endTime: null, created_at: string, updated_at: string, isAdminAuth: number, adminAuthUserId: null, minorGroupId: number, lecture: { id: number, bookId: number, groupId: number, type: string, profId: string, profName: string, day: number, h: number, m: number, limit: number, space: number, auditories: number, duration: number, isPilot: number, sameProf: number, created_at: string, updated_at: string, listId: number, groupName: null, comment: null, tema: null, nashromi_praqtika_status: string, userId: number, userLevel: string, ipAddress: number, visibility: number, limitVisibility: number, parentId: number, groupComment: string, curation: number, curationFromDate: string, curationToDate: string, attached_seminars: [], additionalType: string, withoutList: number, attached_lectures: null, tagId: number, lectureSeminar: number, curationDuration: string, status: number, student_tags: [], minLimit: number, calendarExceptType: string, childGroupDate: string, startDate: string, endDate: string, groups_for_registration: [] }, seminar: { id: number, bookId: number, groupId: number, type: string, profId: string, profName: string, day: number, h: number, m: number
```

### `/registration/getMinorList`

- Method: GET
- Body: -
- Status seen: 200

```
[{ id: number, name: string, nameEng: string, qualificationName: null, qualificationNameEng: null, year: string, schoolId: number, specialId: number, type: number, level: string, status: string, description: null, created_at: string, updated_at: string, view: number, eduId: number }]
```

### `/registration/allSelectablePrograms`

- Method: POST
- Body: -
- Status seen: 200

```
{ result: string, errors: { registrationGroupId: [string] } }
```

### `/stat/gpaBySemester`

- Method: POST
- Body: { eduId: number }
- Status seen: 200

```
{ result: string, data: { labels: [string], data: [number], colors: [string] } }
```

### `/stat/gpaBySeason`

- Method: POST
- Body: { eduId: number }
- Status seen: 200

```
{ result: string, data: { labels: [string], data: [number], colors: [string] } }
```

### `/tables/getAcTables/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [], first_page_url: string, from: null, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: number, prev_page_url: null, to: null, total: number }
```

### `/dashboardInfo/`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, student: { id: number, mail: string, username: null, photo_code: string, firstName: string, lastName: string, firstNameEng: string, lastNameEng: string, personalNumber: string, personalCardNum: string, birthday: string, gender: string, regionId: null, address: string, phone: string, phoneSecond: string, ban: string, banReason: null, created_at: string, updated_at: string, version: null, registerStatus: string, refugee: number, registrationTime: null, skipFinance: number, comment: null, country: string, isSpecialNeeds: null, isPersonWithLearningDisabilities: null, wtoStepAuth: number, militaryPlace: string, moreInfo: null, parentFirstName: null, parentLastName: null, parentPersonalNumber: null, parentPhoneNumber: null, syncKey: null, ipAddress: null, loginIpAddress: string, verified: number, questionnaireStatus: null, questionnaireComment: null, defaultCurrency: number, financeVerified: number, agentId: null, commandVerified: number, lang: string, isRehabilitant: number, unblockGroupsValidation: number, needTestingAccess: number, hasSeenScholarship: null, tag: string, mailPersonal: string, addressJuridical: string, emergencyContact: string, examNumber: null, examScore: null, educationalInstitution: number, dualCitizen: number, country2: null, address_region: null, address_municipality: null, addressJuridical_region: null, addressJuridical_municipality: null, educationalInstitution_region: number, educationalInstitution_municipality: number, militaryPlace_regi
```

### `/getStudentTaskBooks/`

- Method: POST
- Body: -
- Status seen: 404

### `/tasks/`

- Method: POST
- Body: -
- Status seen: 404

### `/task/getUnreadTaskCount`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, inbox: number, required: number }
```

### `/el-learning/getStudentEventList/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [], first_page_url: string, from: null, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: string, prev_page_url: null, to: null, total: number }
```

### `/el-learning/getZoomLinks`

- Method: POST
- Body: -
- Status seen: 200

```
{ data: [] }
```

### `/el-learning/getUnreadElLearningCount`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, inbox: number, required: number }
```

### `/hr/calendar/getItems`

- Method: POST
- Body: { dates: array, filter: object }
- Status seen: 200

```
{ error: string, result: string }
```

### `/hr/calendar/getMandatoryEvents`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, notSeen: [] }
```

### `/hr/calendar/getNativeList/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [{ id: number, type: string, title: string, date: string, time: string, day: number, description: string, engDescription: null, engTitle: null, lang: string, userId: number, userLevel: string, permanent: number, permanentFrom: null, permanentTo: null, isMine: number, mandatory: number, eventAddressatId: number, seen: number, seenDate: string, files: [], reminders: [] }], first_page_url: string, from: number, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: string, prev_page_url: null, to: number, total: number }
```

### `/finances/getStudentFinances`

- Method: POST
- Body: -
- Status seen: 404

### `/finances/getStudentEvents/`

- Method: POST
- Body: -
- Status seen: 404

### `/finances/getEventsNew/`

- Method: POST
- Body: -
- Status seen: 404

### `/finances/getLearningYearNew`

- Method: POST
- Body: -
- Status seen: 404

### `/finances/getVerifyStatus`

- Method: GET
- Body: -
- Status seen: 404

### `/message/count`

- Method: GET
- Body: -
- Status seen: 404

### `/message/inbox/`

- Method: POST
- Body: { type: string }
- Status seen: 404

### `/notification/get/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [], first_page_url: string, from: null, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: number, prev_page_url: null, to: null, total: number }
```

### `/notification/getUnreadNotificationCount`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, inbox: number, required: number }
```

### `/userNotification/getUnreadUserNotificationCount`

- Method: GET
- Body: -
- Status seen: 404

### `/commands/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [{ id: number, type: string, studentId: number, eduId: number, userId: number, status: string, additionalStatus: string, category: number, startDate: string, execDate: string, commandNumber: string, description: string, isDeleted: number, created_at: string, updated_at: string }], first_page_url: string, from: number, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: number, prev_page_url: null, to: number, total: number }
```

### `/bib/getOutedStudentExemplarBooks/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [], first_page_url: string, from: null, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: string, prev_page_url: null, to: null, total: number }
```

### `/bib/getOverdueState`

- Method: GET
- Body: -
- Status seen: 200

```
{ result: string, count: number, showAlert: boolean, message: string }
```

### `/bib/getBookingInfo`

- Method: POST
- Body: -
- Status seen: 200

```
{ error: string, result: string }
```

### `/chancellery/getStudentSentJournals/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [{ id: number, userType: string, userId: number, name: string, description: string, categoryId: number, type: number, status: string, chancelleryNumber: string, year: number, documentNumber: null, registrationDate: string, releaseDate: null, addressType: null, organisationSN: null, organisationName: null, personNumber: null, personName: null, countOfBasePages: null, countOfAdditionalPages: null, descriptionText: null, inboxType: string, hasFile: number, studentPersonalNumber: string, studentFirstName: string, studentLastName: string, schoolId: string, specialId: string, personalNumber: string, firstName: string, lastName: string, created_at: string, updated_at: string, second_category: null, comment: null, file: string, archive: number, mobilobaSpecId: null, finalStatus: string, finalStatusComment: string, actionAdmin: number, writeOffDate: null, successText: string, finalStatusDate: string, doc: string, oneUserConfirm: number, logUserType: null, logUserId: null, logIpAddress: null, templateId: number, formType: number, email: null, appelationListId: null, appelationExamType: null, studentCanDisable: number, estListName: string }], first_page_url: string, from: number, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: number, prev_page_url: null, to: number, total: number }
```

### `/chancellery/getUserInfo`

- Method: GET
- Body: -
- Status seen: 200

```
{ st_name: string, st_lastname: string, st_phone: string, st_pinum: string, firstNameEng: string, lastNameEng: string, st_program: string, st_id: number, st_faculty: string, st_status: string, st_eng_status: string, st_level: string, st_progra_m_rotation: null, st__level_rotation: string, current_time: string, st_charicxvis_weli: string, st_semestri: number }
```

### `/fellowship/getStudentDates/`

- Method: POST
- Body: -
- Status seen: 404

### `/fellowship/showFellowshipMenu`

Not exercised yet.

### `/poll/getPollResponseList/`

- Method: POST
- Body: -
- Status seen: 200

```
{ current_page: number, data: [], first_page_url: string, from: null, last_page: number, last_page_url: string, next_page_url: null, path: string, per_page: string, prev_page_url: null, to: null, total: number }
```

### `/poll/getPollForAlert`

Not exercised yet.

### `/quickAlert/checkStipendiaInfo`

- Method: POST
- Body: -
- Status seen: 200

```
{ error: string, result: string }
```

### `/lang/list`

- Method: POST
- Body: { withGeo: boolean }
- Status seen: 200

```
{ languages: [{ code: string, flag: string, name: string }] }
```

### `/setting/get`

- Method: GET
- Body: -
- Status seen: 405

## Writes and "marks as read" endpoints (never call without an explicit yes)

- `/lms/learningCourses/group/setAssignmentsSeenForStudent`: marks homework as seen
- `/lms/learningCourses/group/writeAssignment`: submits homework
- `/lms/learningCourses/group/removeAssignmentAnswer`: deletes your submission
- `/lms/learningCourses/group/removeAssignmentAttachment`: deletes a submitted file
- `/task/markAsReadTasks`: marks tasks read
- `/notification/read`: marks notifications read
- `/message/view`: opens a message, marks it read
- `/el-learning/readAllEvent/`: marks e-learning events read
- `/hr/calendar/seen`: marks a calendar event seen
- `/bib/acknowledgeOverdue`: acknowledges a library overdue notice
- `/poll/saveAlertSeen`: marks a poll alert seen
- `/chancellery/makeDocRequest`: requests an official document
- `/fellowship/reserveDate`: reserves a fellowship slot
- `/registration/register`: course registration
- `/registration/registerList`: course registration

Everything else the frontend calls is listed by `kiu discover` as "unreviewed".
