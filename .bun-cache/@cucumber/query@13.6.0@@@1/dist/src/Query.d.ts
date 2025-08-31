import * as messages from '@cucumber/messages';
import { Attachment, Duration, Feature, Hook, Location, Meta, Pickle, PickleStep, Step, StepDefinition, TestCase, TestCaseFinished, TestCaseStarted, TestRunFinished, TestRunStarted, TestStep, TestStepFinished, TestStepResult, TestStepResultStatus, TestStepStarted } from '@cucumber/messages';
import { Lineage, NamingStrategy } from './Lineage';
export default class Query {
    private readonly testStepResultByPickleId;
    private readonly testStepResultsByPickleStepId;
    private readonly testCaseByPickleId;
    private readonly pickleIdByTestStepId;
    private readonly pickleStepIdByTestStepId;
    private readonly testStepResultsbyTestStepId;
    private readonly testStepIdsByPickleStepId;
    private readonly hooksById;
    private readonly attachmentsByTestStepId;
    private readonly stepMatchArgumentsListsByPickleStepId;
    private meta;
    private testRunStarted;
    private testRunFinished;
    private readonly testCaseStartedById;
    private readonly lineageById;
    private readonly stepById;
    private readonly pickleById;
    private readonly pickleStepById;
    private readonly stepDefinitionById;
    private readonly testCaseById;
    private readonly testStepById;
    private readonly testCaseFinishedByTestCaseStartedId;
    private readonly testStepStartedByTestCaseStartedId;
    private readonly testStepFinishedByTestCaseStartedId;
    private readonly attachmentsByTestCaseStartedId;
    update(envelope: messages.Envelope): void;
    private updateGherkinDocument;
    private updateFeature;
    private updateRule;
    private updateScenario;
    private updateSteps;
    private updatePickle;
    private updateTestCase;
    private updateTestCaseStarted;
    private updateTestStepStarted;
    private updateAttachment;
    private updateTestStepFinished;
    private updateTestCaseFinished;
    /**
     * Gets all the results for multiple pickle steps
     * @param pickleStepIds
     */
    getPickleStepTestStepResults(pickleStepIds: readonly string[]): readonly messages.TestStepResult[];
    /**
     * Gets all the results for multiple pickles
     * @param pickleIds
     */
    getPickleTestStepResults(pickleIds: readonly string[]): readonly messages.TestStepResult[];
    /**
     * Gets all the attachments for multiple pickle steps
     * @param pickleStepIds
     */
    getPickleStepAttachments(pickleStepIds: readonly string[]): readonly messages.Attachment[];
    getTestStepsAttachments(testStepIds: readonly string[]): readonly messages.Attachment[];
    /**
     * Get StepMatchArguments for a pickle step
     * @param pickleStepId
     */
    getStepMatchArgumentsLists(pickleStepId: string): readonly messages.StepMatchArgumentsList[] | undefined;
    getHook(hookId: string): messages.Hook;
    getBeforeHookSteps(pickleId: string): readonly messages.TestStep[];
    getAfterHookSteps(pickleId: string): readonly messages.TestStep[];
    private identifyHookSteps;
    getTestStepResults(testStepId: string): messages.TestStepResult[];
    getStatusCounts(pickleIds: readonly string[]): Partial<Record<messages.TestStepResultStatus, number>>;
    countMostSevereTestStepResultStatus(): Record<TestStepResultStatus, number>;
    countTestCasesStarted(): number;
    findAllPickles(): ReadonlyArray<Pickle>;
    findAllPickleSteps(): ReadonlyArray<PickleStep>;
    findAllTestCaseStarted(): ReadonlyArray<TestCaseStarted>;
    findAllTestCaseStartedGroupedByFeature(): Map<Feature | undefined, ReadonlyArray<TestCaseStarted>>;
    findAllTestSteps(): ReadonlyArray<TestStep>;
    findAttachmentsBy(testStepFinished: TestStepFinished): ReadonlyArray<Attachment>;
    findFeatureBy(testCaseStarted: TestCaseStarted): Feature | undefined;
    findHookBy(testStep: TestStep): Hook | undefined;
    findMeta(): Meta | undefined;
    findMostSevereTestStepResultBy(testCaseStarted: TestCaseStarted): TestStepResult | undefined;
    findNameOf(pickle: Pickle, namingStrategy: NamingStrategy): string;
    findLocationOf(pickle: Pickle): Location | undefined;
    findPickleBy(element: TestCaseStarted | TestStepStarted): Pickle | undefined;
    findPickleStepBy(testStep: TestStep): PickleStep | undefined;
    findStepBy(pickleStep: PickleStep): Step | undefined;
    findStepDefinitionsBy(testStep: TestStep): ReadonlyArray<StepDefinition>;
    findUnambiguousStepDefinitionBy(testStep: TestStep): StepDefinition | undefined;
    findTestCaseBy(element: TestCaseStarted | TestStepStarted): TestCase | undefined;
    findTestCaseDurationBy(testCaseStarted: TestCaseStarted): Duration | undefined;
    findTestCaseStartedBy(testStepStarted: TestStepStarted): TestCaseStarted | undefined;
    findTestCaseFinishedBy(testCaseStarted: TestCaseStarted): TestCaseFinished | undefined;
    findTestRunDuration(): Duration | undefined;
    findTestRunFinished(): TestRunFinished | undefined;
    findTestRunStarted(): TestRunStarted | undefined;
    findTestStepBy(element: TestStepStarted | TestStepFinished): TestStep | undefined;
    findTestStepsStartedBy(testCaseStarted: TestCaseStarted): ReadonlyArray<TestStepStarted>;
    findTestStepsFinishedBy(testCaseStarted: TestCaseStarted): ReadonlyArray<TestStepFinished>;
    findTestStepFinishedAndTestStepBy(testCaseStarted: TestCaseStarted): ReadonlyArray<[TestStepFinished, TestStep]>;
    findLineageBy(element: Pickle | TestCaseStarted): Lineage | undefined;
}
//# sourceMappingURL=Query.d.ts.map