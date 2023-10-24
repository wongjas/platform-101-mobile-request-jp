import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
const APPROVE_ID = "approve_request";
const DENY_ID = "deny_request";

export const ReviewRequestDefinition = DefineFunction({
  callback_id: "review_request_function_jp",
  title: "携帯のリクエストを確認する",
  description:
    "Sends a message to the admin within a thread to approve or deny a request",
  source_file: "functions/review_request_function.ts",
  input_parameters: {
    properties: {
      manager: {
        type: Schema.slack.types.user_id,
        description: "The user's manager",
      },
      requester: {
        type: Schema.slack.types.user_id,
        description: "The requesting user",
      },
      last_upgrade: {
        type: Schema.types.string,
        description: "The date of the last upgrade of a user's mobile device",
      },
      mobile_device: {
        type: Schema.types.string,
        description: "The mobile device of the user",
      },
    },
    required: ["manager", "requester", "mobile_device", "last_upgrade"],
  },
  output_parameters: {
    properties: {
      approval_message: {
        type: Schema.types.string,
        description: "Approval message",
      },
    },
    required: ["approval_message"],
  },
});

export default SlackFunction(
  ReviewRequestDefinition,
  async ({ inputs, client }) => {
    const blocks = [{
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text":
          `<@${inputs.requester}> は新しい ${inputs.mobile_device} をリクエストしています。最後にアップグレードしたのは ${inputs.last_upgrade} です。`,
      },
    }, {
      "type": "actions",
      "block_id": "approve-deny-buttons",
      "elements": [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "承認する",
          },
          action_id: APPROVE_ID,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "拒否する",
          },
          action_id: DENY_ID,
          style: "danger",
        },
      ],
    }];

    const postResponse = await client.chat.postMessage({
      blocks: blocks,
      channel: inputs.manager,
    });

    if (!postResponse.ok) {
      console.error("Error pulling from database!", postResponse.error);
    }

    return { completed: false };
  },
).addBlockActionsHandler(
  [APPROVE_ID, DENY_ID],
  async function ({ action, body, client }) {
    console.log("Incoming action handler invocation", action);

    const approved: boolean = action.action_id === APPROVE_ID;

    let approval_message = approved
      ? ":white_check_mark: このリクエストが承認されました！新しい携帯はまもなく送られます。"
      : ":x: 残念ながら、このリクエストが拒否されました。";

    // (OPTIONAL) Update the manager's message to remove the buttons and reflect the approval state.
    const msgUpdate = await client.chat.update({
      channel: body.container.channel_id,
      ts: body.container.message_ts,
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text":
              `<@${body.function_data.inputs.requester}> は新しい ${body.function_data.inputs.mobile_device} をリクエストしています。最後にアップグレードしたのは ${body.function_data.inputs.last_upgrade} です。`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `${
                approved
                  ? " :white_check_mark: このリクエストを承認しました。"
                  : ":x: このリクエストを拒否しました。"
              }`,
            },
          ],
        },
      ],
    });

    if (!msgUpdate.ok) {
      console.error("Error during manager chat.update!", msgUpdate.error);
    }

    await client.functions.completeSuccess({
      function_execution_id: body.function_data.execution_id,
      outputs: { approval_message: approval_message },
    });
  },
);
