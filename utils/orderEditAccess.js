const EDITOR_EDITABLE_STATUSES = ["pending", "approved"];

function canEditOrderItems(user, order) {
  if (!user || !order) {
    return false;
  }

  if (user.position === "admin" || user.position === "editor") {
    return EDITOR_EDITABLE_STATUSES.includes(order.status);
  }

  if (user.position === "worker") {
    return (
      order.status === "pending" &&
      order.worker.toString() === user._id.toString()
    );
  }

  return false;
}

function isStaffFulfillmentEdit(user) {
  return user.position === "admin" || user.position === "editor";
}

module.exports = {
  EDITOR_EDITABLE_STATUSES,
  canEditOrderItems,
  isStaffFulfillmentEdit,
};
